// bendwith.us on Android, React Native.
//
// The live session: native camera + MediaPipe for landmarks (android/.../PoseCameraView.kt),
// then the website's own measurement code for the angle, the smoothing and the rep count
// (src/pose/, copied unchanged from frontend/src/pose/). What you see here is the core loop
// only -- see PORT-STATUS.md for what the web app still does that this does not.

import { useEffect, useState } from 'react'
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { PoseCamera } from './src/pose/PoseCamera'
import { JOINTS, type JointName } from './src/pose/joints'
import { useNativePose } from './src/pose/useNativePose'

const JOINT: JointName = 'knee'
const TARGET = 90
const REPS = 10

export default function App() {
  const [granted, setGranted] = useState<boolean | null>(null)
  const { reading, onFrame, reset } = useNativePose(JOINT, TARGET)
  const cfg = JOINTS[JOINT]

  useEffect(() => {
    if (Platform.OS !== 'android') return setGranted(true)
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)
      .then((r) => setGranted(r === PermissionsAndroid.RESULTS.GRANTED))
      .catch(() => setGranted(false))
  }, [])

  const atTarget = reading.angle != null && reading.angle >= TARGET
  const done = reading.reps >= REPS

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.stage}>
        {granted === true ? (
          <PoseCamera style={styles.camera} onFrame={onFrame} />
        ) : (
          <Text style={styles.waiting}>
            {granted === false ? 'Camera permission denied.' : 'Asking for the camera…'}
          </Text>
        )}
      </View>

      <View style={styles.readout}>
        <Text style={styles.label}>{cfg.label.toUpperCase()}</Text>
        <Text style={[styles.angle, atTarget && styles.angleHit]}>
          {reading.angle == null ? '—' : `${Math.round(reading.angle)}°`}
        </Text>
        <Text style={styles.sub}>target {TARGET}°</Text>

        <View style={styles.row}>
          <Stat label="Reps" value={`${reading.reps}/${REPS}`} />
          <Stat label="Best" value={reading.maxAngle ? `${Math.round(reading.maxAngle)}°` : '—'} />
        </View>

        <Text style={styles.hint}>
          {done
            ? 'Set complete.'
            : reading.tracking
              ? reading.warnings.length
                ? reading.warnings.join(', ').replace(/_/g, ' ')
                : cfg.tip
              : 'Sit side-on to the camera, whole limb in frame.'}
        </Text>

        <Pressable style={styles.button} onPress={reset}>
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1414' },
  stage: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  camera: { width: '100%', height: '100%' },
  waiting: { color: '#9fb0b0', fontSize: 16 },
  readout: { padding: 24, gap: 6 },
  label: { color: '#6f8585', fontSize: 12, letterSpacing: 2 },
  angle: { color: '#f3f7f7', fontSize: 68, fontWeight: '700', lineHeight: 72 },
  angleHit: { color: '#5ee3b1' },
  sub: { color: '#6f8585', fontSize: 14 },
  row: { flexDirection: 'row', gap: 32, marginTop: 14 },
  stat: { gap: 2 },
  statLabel: { color: '#6f8585', fontSize: 12, letterSpacing: 1 },
  statValue: { color: '#f3f7f7', fontSize: 24, fontWeight: '600' },
  hint: { color: '#9fb0b0', fontSize: 15, marginTop: 16, minHeight: 40 },
  button: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#1c2a2a',
  },
  buttonText: { color: '#f3f7f7', fontSize: 15, fontWeight: '600' },
})
