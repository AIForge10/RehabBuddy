// The native camera + MediaPipe view (android/.../PoseCameraView.kt) as a React component.
// It renders the preview and fires onPose for every frame MediaPipe returns landmarks for.

import { requireNativeComponent, type ViewStyle } from 'react-native'
import type { PoseFrame } from './landmarks'

interface NativeProps {
  style?: ViewStyle
  onPose?: (e: { nativeEvent: PoseFrame }) => void
}

const Native = requireNativeComponent<NativeProps>('PoseCamera')

export function PoseCamera({
  style,
  onFrame,
}: {
  style?: ViewStyle
  /** Called on the JS thread for each analysed frame. */
  onFrame: (frame: PoseFrame) => void
}) {
  return <Native style={style} onPose={(e) => onFrame(e.nativeEvent)} />
}
