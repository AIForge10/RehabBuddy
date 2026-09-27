package com.bendwithrn

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.util.Log
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.util.concurrent.Executors

/**
 * The web app gets its landmarks from @mediapipe/tasks-vision, a WASM build that cannot
 * load in React Native. This is the replacement: CameraX feeds frames to MediaPipe's
 * Android PoseLandmarker in LIVE_STREAM mode, and each result is sent up to JS as an
 * `onPose` event carrying the same 33 normalized landmarks the web pipeline expects.
 *
 * Only the landmark SOURCE is native. Every measurement above it -- the angle, the rep
 * counter, the smoothing, the form faults -- stays the TypeScript that the website uses
 * (src/pose/, copied unchanged from frontend/src/pose/), so the two platforms cannot
 * drift on the numbers that matter clinically.
 */
class PoseCameraView(private val reactContext: ReactContext) : FrameLayout(reactContext) {

  private val preview = PreviewView(reactContext)
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private var landmarker: PoseLandmarker? = null
  private var provider: ProcessCameraProvider? = null
  /** Frames are dropped while one is in flight, so a slow phone lowers its rate instead of queueing. */
  @Volatile private var busy = false

  init {
    addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun start() {
    if (landmarker != null) return
    try {
      landmarker = PoseLandmarker.createFromOptions(
        reactContext,
        PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(
            BaseOptions.builder()
              // Bundled in assets/ so a session works with no network, as the Capacitor app does.
              .setModelAssetPath(MODEL_ASSET)
              .setDelegate(Delegate.GPU)
              .build(),
          )
          .setRunningMode(RunningMode.LIVE_STREAM)
          .setNumPoses(1)
          .setMinPoseDetectionConfidence(0.5f)
          .setMinPosePresenceConfidence(0.5f)
          .setMinTrackingConfidence(0.5f)
          .setResultListener { result, input -> emit(result, input.width, input.height) }
          .setErrorListener { e -> Log.e(TAG, "pose landmarker", e) }
          .build(),
      )
    } catch (e: Throwable) {
      // GPU is unavailable on some emulators and older phones; CPU is slower but works.
      Log.w(TAG, "GPU delegate failed, falling back to CPU", e)
      landmarker = PoseLandmarker.createFromOptions(
        reactContext,
        PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(
            BaseOptions.builder().setModelAssetPath(MODEL_ASSET).setDelegate(Delegate.CPU).build(),
          )
          .setRunningMode(RunningMode.LIVE_STREAM)
          .setNumPoses(1)
          .setResultListener { result, input -> emit(result, input.width, input.height) }
          .setErrorListener { e -> Log.e(TAG, "pose landmarker", e) }
          .build(),
      )
    }
    bindCamera()
  }

  private fun bindCamera() {
    val future = ProcessCameraProvider.getInstance(reactContext)
    future.addListener({
      try {
        val p = future.get()
        provider = p
        val previewUse = Preview.Builder().build().also {
          // CameraX 1.3 exposes this as a setter; the property form arrived in 1.4.
          it.setSurfaceProvider(preview.surfaceProvider)
        }
        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
        analysis.setAnalyzer(analysisExecutor) { frame -> analyse(frame) }
        p.unbindAll()
        val owner = reactContext.currentActivity as? LifecycleOwner
        if (owner == null) {
          Log.e(TAG, "no LifecycleOwner: cannot bind camera")
          return@addListener
        }
        // The patient sits side-on to the FRONT camera, matching the web setup guide.
        p.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, previewUse, analysis)
      } catch (e: Throwable) {
        Log.e(TAG, "camera bind failed", e)
      }
    }, reactContext.mainExecutor)
  }

  @SuppressLint("UnsafeOptInUsageError")
  private fun analyse(frame: ImageProxy) {
    if (busy) {
      frame.close()
      return
    }
    busy = true
    try {
      val bitmap = Bitmap.createBitmap(frame.width, frame.height, Bitmap.Config.ARGB_8888)
      bitmap.copyPixelsFromBuffer(frame.planes[0].buffer)
      landmarker?.detectAsync(BitmapImageBuilder(bitmap).build(), System.currentTimeMillis())
    } catch (e: Throwable) {
      Log.e(TAG, "frame", e)
    } finally {
      busy = false
      frame.close()
    }
  }

  private fun emit(result: PoseLandmarkerResult, width: Int, height: Int) {
    val payload: WritableMap = Arguments.createMap()
    val marks = Arguments.createArray()
    result.landmarks().firstOrNull()?.forEach { lm ->
      val m = Arguments.createMap()
      m.putDouble("x", lm.x().toDouble())
      m.putDouble("y", lm.y().toDouble())
      m.putDouble("z", lm.z().toDouble())
      // MediaPipe wraps visibility in Optional; absent means "not reported", treated as visible.
      m.putDouble("visibility", lm.visibility().orElse(1f).toDouble())
      marks.pushMap(m)
    }
    payload.putArray("landmarks", marks)
    payload.putInt("width", width)
    payload.putInt("height", height)
    payload.putDouble("timestamp", System.currentTimeMillis().toDouble())
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
      ?.dispatchEvent(PoseEvent(UIManagerHelper.getSurfaceId(this), id, payload))
  }

  fun stop() {
    try {
      provider?.unbindAll()
      landmarker?.close()
    } catch (e: Throwable) {
      Log.w(TAG, "stop", e)
    }
    landmarker = null
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  private class PoseEvent(surfaceId: Int, viewTag: Int, private val payload: WritableMap) :
    Event<PoseEvent>(surfaceId, viewTag) {
    override fun getEventName() = "topPose"
    override fun getEventData() = payload
  }

  companion object {
    private const val TAG = "PoseCameraView"
    private const val MODEL_ASSET = "pose_landmarker_full.task"
  }
}
