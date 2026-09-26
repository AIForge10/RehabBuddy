# """RehabBuddy — multi-joint angle + rep counter prototype (Satyabrata).

# Works for knee, hip, elbow, shoulder, wrist. Same logic as the browser version,
# so thresholds tuned here can be copied into frontend/src/pose/.

# Run (from repo root or from ml/):
#     python ml/angle_prototype.py                  # knee (default)
#     python ml/angle_prototype.py --joint elbow    # test sitting at your desk
#     python ml/angle_prototype.py --camera 1       # external webcam

# Keys:  q quit | r reset | j next joint | [ ] bent threshold -/+ 5 | ; ' straight threshold -/+ 5
# """
# import argparse
# import math
# import os
# import time
# import urllib.request
# from collections import deque

# import cv2
# import mediapipe as mp

# MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_lite.task")
# MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
#              "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")
# MIN_VISIBILITY = 0.5

# # ---------- Joint library ----------
# # a / joint / b : MediaPipe landmark indices for (left, right)
# # mode "flexion": angle = 180 - theta  (straight limb = 0, bent = bigger)   -> knee, hip, elbow, wrist
# # mode "raw":     angle = theta        (arm at side = small, raised = bigger) -> shoulder
# # Every exercise starts at rest (low angle), rises past `bent`, returns below `straight`.
# JOINTS = {
#     "knee": {
#         "a": (23, 24), "joint": (25, 26), "b": (27, 28), "mode": "flexion",
#         "bent": 45, "straight": 20, "target": 90,
#         "tip": "Stand SIDE-ON, whole leg in frame, bend your knee",
#     },
#     "hip": {
#         "a": (11, 12), "joint": (23, 24), "b": (25, 26), "mode": "flexion",
#         "bent": 40, "straight": 15, "target": 90,
#         "tip": "Stand SIDE-ON, lift your knee towards your chest",
#     },
#     "elbow": {
#         "a": (11, 12), "joint": (13, 14), "b": (15, 16), "mode": "flexion",
#         "bent": 60, "straight": 25, "target": 130,
#         "tip": "Sit SIDE-ON, arm straight down, curl your forearm up",
#     },
#     "shoulder": {
#         "a": (23, 24), "joint": (11, 12), "b": (13, 14), "mode": "raw",
#         "bent": 60, "straight": 30, "target": 90,
#         "tip": "FACE the camera, arm at your side, raise it out sideways",
#     },
#     "wrist": {
#         "a": (13, 14), "joint": (15, 16), "b": (19, 20), "mode": "flexion",
#         "bent": 35, "straight": 15, "target": 60,
#         "tip": "Rest forearm SIDE-ON, bend your hand up/down (low accuracy)",
#     },
# }
# JOINT_ORDER = list(JOINTS)


# # ---------- angle math ----------
# def angle_at(a, j, b) -> float:
#     """Raw angle theta at point j, in degrees (0-180)."""
#     ja = (a.x - j.x, a.y - j.y)
#     jb = (b.x - j.x, b.y - j.y)
#     mag = math.hypot(*ja) * math.hypot(*jb)
#     if mag == 0:
#         return 0.0
#     cos = max(-1.0, min(1.0, (ja[0] * jb[0] + ja[1] * jb[1]) / mag))
#     return math.degrees(math.acos(cos))


# def joint_angle(cfg, a, j, b) -> float:
#     theta = angle_at(a, j, b)
#     return 180.0 - theta if cfg["mode"] == "flexion" else theta


# class Smoother:
#     def __init__(self, size: int = 5):
#         self.buf = deque(maxlen=size)

#     def push(self, v: float) -> float:
#         self.buf.append(v)
#         return sum(self.buf) / len(self.buf)


# def pick_side(lm, cfg):
#     """Use whichever side (left/right) the camera sees better."""
#     def vis(i):
#         return min(lm[cfg["a"][i]].visibility, lm[cfg["joint"][i]].visibility, lm[cfg["b"][i]].visibility)
#     l, r = vis(0), vis(1)
#     if max(l, r) < MIN_VISIBILITY:
#         return None
#     return 0 if l >= r else 1


# # ---------- rep counter (same as repCounter.ts) ----------
# class RepCounter:
#     def __init__(self, bent_threshold=45, straight_threshold=20, target_angle=90, min_rep_ms=1200):
#         self.bent_threshold = bent_threshold
#         self.straight_threshold = straight_threshold
#         self.target_angle = target_angle
#         self.min_rep_ms = min_rep_ms
#         self.reset()

#     def reset(self):
#         self.count = 0
#         self.max_angle = 0.0
#         self.warnings = []
#         self.bent = False
#         self.rep_peak = 0.0
#         self.rep_start = 0.0

#     def update(self, angle: float, now_ms: float):
#         self.max_angle = max(self.max_angle, angle)
#         if not self.bent and angle > self.bent_threshold:
#             self.bent, self.rep_peak, self.rep_start = True, angle, now_ms
#         elif self.bent:
#             self.rep_peak = max(self.rep_peak, angle)
#             if angle < self.straight_threshold:
#                 self.bent = False
#                 self.count += 1
#                 w = []
#                 if self.rep_peak < self.target_angle - 10:
#                     w.append("not_deep_enough")
#                 if now_ms - self.rep_start < self.min_rep_ms:
#                     w.append("too_fast")
#                 self.warnings.extend(w)
#                 return {"count": self.count, "peak": self.rep_peak, "warnings": w}
#         return None


# def counter_for(name):
#     c = JOINTS[name]
#     return RepCounter(c["bent"], c["straight"], c["target"])


# def draw_limb(frame, pts, color, label):
#     for p, q in ((pts[0], pts[1]), (pts[1], pts[2])):
#         cv2.line(frame, p, q, color, 4)
#     for p in pts:
#         cv2.circle(frame, p, 7, (255, 255, 255), -1)
#     cv2.putText(frame, label, (pts[1][0] + 12, pts[1][1]), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)


# def main():
#     ap = argparse.ArgumentParser()
#     ap.add_argument("--camera", type=int, default=0)
#     ap.add_argument("--joint", choices=JOINT_ORDER, default="knee")
#     args = ap.parse_args()

#     if not os.path.exists(MODEL_PATH):
#         print("Downloading pose model (one time)...")
#         urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)

#     opts = mp.tasks.vision.PoseLandmarkerOptions(
#         base_options=mp.tasks.BaseOptions(model_asset_path=MODEL_PATH,
#                                           delegate=mp.tasks.BaseOptions.Delegate.CPU),  # Mac GPU fix
#         running_mode=mp.tasks.vision.RunningMode.VIDEO,
#         num_poses=1,
#     )
#     landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(opts)
#     cap = cv2.VideoCapture(args.camera)
#     if not cap.isOpened():
#         raise SystemExit("Camera not available. Mac: System Settings > Privacy & Security > Camera > allow Terminal/VS Code")

#     joint = args.joint
#     smoother, counter = Smoother(5), counter_for(joint)
#     last_msg, t0 = "", time.monotonic()
#     frames, fps, fps_t = 0, 0.0, time.monotonic()
#     print(f"Joint: {joint} -> {JOINTS[joint]['tip']}")

#     while True:
#         ok, frame = cap.read()
#         if not ok:
#             break
#         cfg = JOINTS[joint]
#         now_ms = (time.monotonic() - t0) * 1000
#         img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
#         res = landmarker.detect_for_video(img, int(now_ms))

#         angle_txt, side_txt = "not visible", "-"
#         if res.pose_landmarks:
#             lm = res.pose_landmarks[0]
#             side = pick_side(lm, cfg)
#             if side is not None:
#                 a, j, b = lm[cfg["a"][side]], lm[cfg["joint"][side]], lm[cfg["b"][side]]
#                 angle = smoother.push(joint_angle(cfg, a, j, b))
#                 ev = counter.update(angle, now_ms)
#                 if ev:
#                     last_msg = f"Rep {ev['count']}: peak {ev['peak']:.0f} deg {' '.join(ev['warnings'])}"
#                     print(f"[{joint}] {last_msg}")
#                 h, w = frame.shape[:2]
#                 pts = [(int(p.x * w), int(p.y * h)) for p in (a, j, b)]
#                 color = (0, 200, 255) if counter.bent else (0, 220, 0)
#                 draw_limb(frame, pts, color, f"{angle:.0f}")
#                 angle_txt, side_txt = f"{angle:5.1f} deg", ("left", "right")[side]

#         frames += 1
#         if time.monotonic() - fps_t >= 1:
#             fps, frames, fps_t = frames / (time.monotonic() - fps_t), 0, time.monotonic()

#         lines = [
#             f"JOINT: {joint.upper()}  (press j to switch)",
#             f"Angle: {angle_txt}   Reps: {counter.count}   Max: {counter.max_angle:.0f}",
#             f"Side: {side_txt}   FPS: {fps:.0f}",
#             f"Bent > {counter.bent_threshold}   Straight < {counter.straight_threshold}   Target {counter.target_angle}",
#             cfg["tip"],
#             last_msg,
#         ]
#         for i, text in enumerate(lines):
#             cv2.putText(frame, text, (15, 32 + i * 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

#         cv2.imshow("RehabBuddy prototype (q to quit)", frame)
#         key = cv2.waitKey(1) & 0xFF
#         if key == ord("q"):
#             break
#         elif key == ord("r"):
#             counter.reset()
#             last_msg = "reset"
#         elif key == ord("j"):
#             joint = JOINT_ORDER[(JOINT_ORDER.index(joint) + 1) % len(JOINT_ORDER)]
#             smoother, counter, last_msg = Smoother(5), counter_for(joint), ""
#             print(f"Joint: {joint} -> {JOINTS[joint]['tip']}")
#         elif key == ord("["):
#             counter.bent_threshold -= 5
#         elif key == ord("]"):
#             counter.bent_threshold += 5
#         elif key == ord(";"):
#             counter.straight_threshold -= 5
#         elif key == ord("'"):
#             counter.straight_threshold += 5

#     print(f"\nFinal ({joint}): reps={counter.count} max={counter.max_angle:.1f} "
#           f"warnings={sorted(set(counter.warnings))}")
#     print(f"Tuned for {joint}: bent={counter.bent_threshold}, straight={counter.straight_threshold}")
#     cap.release()
#     cv2.destroyAllWindows()
#     landmarker.close()


# if __name__ == "__main__":
#     main()

"""RehabBuddy — multi-joint angle + rep counter prototype (Satyabrata).

Works for knee, hip, elbow, shoulder, wrist. Same logic as the browser version,
so thresholds tuned here can be copied into frontend/src/pose/.

Run (from repo root or from ml/):
    python ml/angle_prototype.py                  # knee (default)
    python ml/angle_prototype.py --joint elbow    # test sitting at your desk
    python ml/angle_prototype.py --camera 1       # external webcam
    python ml/angle_prototype.py --legacy         # macOS crash workaround (needs mediapipe 0.10.14 env)

Keys:  q quit | r reset | j next joint | [ ] bent threshold -/+ 5 | ; ' straight threshold -/+ 5
"""
import argparse
import math
import os
import time
import urllib.request
from collections import deque

import cv2
import mediapipe as mp

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_landmarker_lite.task")
MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
             "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")
MIN_VISIBILITY = 0.5

# ---------- Joint library ----------
# a / joint / b : MediaPipe landmark indices for (left, right)
# mode "flexion": angle = 180 - theta  (straight limb = 0, bent = bigger)   -> knee, hip, elbow, wrist
# mode "raw":     angle = theta        (arm at side = small, raised = bigger) -> shoulder
# Every exercise starts at rest (low angle), rises past `bent`, returns below `straight`.
JOINTS = {
    "knee": {
        "a": (23, 24), "joint": (25, 26), "b": (27, 28), "mode": "flexion",
        "bent": 45, "straight": 20, "target": 90,
        "tip": "Stand SIDE-ON, whole leg in frame, bend your knee",
    },
    "hip": {
        "a": (11, 12), "joint": (23, 24), "b": (25, 26), "mode": "flexion",
        "bent": 40, "straight": 15, "target": 90,
        "tip": "Stand SIDE-ON, lift your knee towards your chest",
    },
    "elbow": {
        "a": (11, 12), "joint": (13, 14), "b": (15, 16), "mode": "flexion",
        "bent": 60, "straight": 25, "target": 130,
        "tip": "Sit SIDE-ON, arm straight down, curl your forearm up",
    },
    "shoulder": {
        "a": (23, 24), "joint": (11, 12), "b": (13, 14), "mode": "raw",
        "bent": 60, "straight": 30, "target": 90,
        "tip": "FACE the camera, arm at your side, raise it out sideways",
    },
    "wrist": {
        "a": (13, 14), "joint": (15, 16), "b": (19, 20), "mode": "flexion",
        "bent": 35, "straight": 15, "target": 60,
        "tip": "Rest forearm SIDE-ON, bend your hand up/down (low accuracy)",
    },
}
JOINT_ORDER = list(JOINTS)


# ---------- angle math ----------
def angle_at(a, j, b) -> float:
    """Raw angle theta at point j, in degrees (0-180)."""
    ja = (a.x - j.x, a.y - j.y)
    jb = (b.x - j.x, b.y - j.y)
    mag = math.hypot(*ja) * math.hypot(*jb)
    if mag == 0:
        return 0.0
    cos = max(-1.0, min(1.0, (ja[0] * jb[0] + ja[1] * jb[1]) / mag))
    return math.degrees(math.acos(cos))


def joint_angle(cfg, a, j, b) -> float:
    theta = angle_at(a, j, b)
    return 180.0 - theta if cfg["mode"] == "flexion" else theta


class Smoother:
    def __init__(self, size: int = 5):
        self.buf = deque(maxlen=size)

    def push(self, v: float) -> float:
        self.buf.append(v)
        return sum(self.buf) / len(self.buf)


def pick_side(lm, cfg):
    """Use whichever side (left/right) the camera sees better."""
    def vis(i):
        return min(lm[cfg["a"][i]].visibility, lm[cfg["joint"][i]].visibility, lm[cfg["b"][i]].visibility)
    l, r = vis(0), vis(1)
    if max(l, r) < MIN_VISIBILITY:
        return None
    return 0 if l >= r else 1


# ---------- rep counter (same as repCounter.ts) ----------
class RepCounter:
    def __init__(self, bent_threshold=45, straight_threshold=20, target_angle=90, min_rep_ms=1200):
        self.bent_threshold = bent_threshold
        self.straight_threshold = straight_threshold
        self.target_angle = target_angle
        self.min_rep_ms = min_rep_ms
        self.reset()

    def reset(self):
        self.count = 0
        self.max_angle = 0.0
        self.warnings = []
        self.bent = False
        self.rep_peak = 0.0
        self.rep_start = 0.0

    def update(self, angle: float, now_ms: float):
        self.max_angle = max(self.max_angle, angle)
        if not self.bent and angle > self.bent_threshold:
            self.bent, self.rep_peak, self.rep_start = True, angle, now_ms
        elif self.bent:
            self.rep_peak = max(self.rep_peak, angle)
            if angle < self.straight_threshold:
                self.bent = False
                self.count += 1
                w = []
                if self.rep_peak < self.target_angle - 10:
                    w.append("not_deep_enough")
                if now_ms - self.rep_start < self.min_rep_ms:
                    w.append("too_fast")
                self.warnings.extend(w)
                return {"count": self.count, "peak": self.rep_peak, "warnings": w}
        return None


def counter_for(name):
    c = JOINTS[name]
    return RepCounter(c["bent"], c["straight"], c["target"])


def draw_limb(frame, pts, color, label):
    for p, q in ((pts[0], pts[1]), (pts[1], pts[2])):
        cv2.line(frame, p, q, color, 4)
    for p in pts:
        cv2.circle(frame, p, 7, (255, 255, 255), -1)
    cv2.putText(frame, label, (pts[1][0] + 12, pts[1][1]), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--joint", choices=JOINT_ORDER, default="knee")
    ap.add_argument("--legacy", action="store_true",
                    help="use the older mp.solutions.pose API (macOS Metal crash workaround)")
    args = ap.parse_args()

    if args.legacy:
        if not hasattr(mp, "solutions"):
            raise SystemExit("--legacy needs mediapipe 0.10.14: conda activate rehabbuddy-proto")
        legacy_pose = mp.solutions.pose.Pose(model_complexity=1, min_detection_confidence=0.5,
                                             min_tracking_confidence=0.5)
        landmarker = None
        print(f"Using legacy mp.solutions.pose (mediapipe {mp.__version__})")
    else:
        if not os.path.exists(MODEL_PATH):
            print("Downloading pose model (one time)...")
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        opts = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=MODEL_PATH,
                                              delegate=mp.tasks.BaseOptions.Delegate.CPU),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=1,
        )
        landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(opts)
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise SystemExit("Camera not available. Mac: System Settings > Privacy & Security > Camera > allow Terminal/VS Code")

    joint = args.joint
    smoother, counter = Smoother(5), counter_for(joint)
    last_msg, t0 = "", time.monotonic()
    frames, fps, fps_t = 0, 0.0, time.monotonic()
    print(f"Joint: {joint} -> {JOINTS[joint]['tip']}")

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        cfg = JOINTS[joint]
        now_ms = (time.monotonic() - t0) * 1000
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if args.legacy:
            out = legacy_pose.process(rgb)
            lm = out.pose_landmarks.landmark if out.pose_landmarks else None
        else:
            res = landmarker.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), int(now_ms))
            lm = res.pose_landmarks[0] if res.pose_landmarks else None

        angle_txt, side_txt = "not visible", "-"
        if lm:
            side = pick_side(lm, cfg)
            if side is not None:
                a, j, b = lm[cfg["a"][side]], lm[cfg["joint"][side]], lm[cfg["b"][side]]
                angle = smoother.push(joint_angle(cfg, a, j, b))
                ev = counter.update(angle, now_ms)
                if ev:
                    last_msg = f"Rep {ev['count']}: peak {ev['peak']:.0f} deg {' '.join(ev['warnings'])}"
                    print(f"[{joint}] {last_msg}")
                h, w = frame.shape[:2]
                pts = [(int(p.x * w), int(p.y * h)) for p in (a, j, b)]
                color = (0, 200, 255) if counter.bent else (0, 220, 0)
                draw_limb(frame, pts, color, f"{angle:.0f}")
                angle_txt, side_txt = f"{angle:5.1f} deg", ("left", "right")[side]

        frames += 1
        if time.monotonic() - fps_t >= 1:
            fps, frames, fps_t = frames / (time.monotonic() - fps_t), 0, time.monotonic()

        lines = [
            f"JOINT: {joint.upper()}  (press j to switch)",
            f"Angle: {angle_txt}   Reps: {counter.count}   Max: {counter.max_angle:.0f}",
            f"Side: {side_txt}   FPS: {fps:.0f}",
            f"Bent > {counter.bent_threshold}   Straight < {counter.straight_threshold}   Target {counter.target_angle}",
            cfg["tip"],
            last_msg,
        ]
        for i, text in enumerate(lines):
            cv2.putText(frame, text, (15, 32 + i * 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        cv2.imshow("RehabBuddy prototype (q to quit)", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("r"):
            counter.reset()
            last_msg = "reset"
        elif key == ord("j"):
            joint = JOINT_ORDER[(JOINT_ORDER.index(joint) + 1) % len(JOINT_ORDER)]
            smoother, counter, last_msg = Smoother(5), counter_for(joint), ""
            print(f"Joint: {joint} -> {JOINTS[joint]['tip']}")
        elif key == ord("["):
            counter.bent_threshold -= 5
        elif key == ord("]"):
            counter.bent_threshold += 5
        elif key == ord(";"):
            counter.straight_threshold -= 5
        elif key == ord("'"):
            counter.straight_threshold += 5

    print(f"\nFinal ({joint}): reps={counter.count} max={counter.max_angle:.1f} "
          f"warnings={sorted(set(counter.warnings))}")
    print(f"Tuned for {joint}: bent={counter.bent_threshold}, straight={counter.straight_threshold}")
    cap.release()
    cv2.destroyAllWindows()
    if landmarker:
        landmarker.close()


if __name__ == "__main__":
    main()