package com.bendwithrn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/** Exposes PoseCameraView to JS as <PoseCamera onPose={...} />. */
class PoseCameraViewManager(private val appContext: ReactApplicationContext) :
  SimpleViewManager<PoseCameraView>() {

  override fun getName() = "PoseCamera"

  override fun createViewInstance(context: ThemedReactContext) =
    PoseCameraView(appContext).also { it.start() }

  override fun onDropViewInstance(view: PoseCameraView) {
    view.stop()
    super.onDropViewInstance(view)
  }

  /** "topPose" (the native event) arrives in JS as the onPose prop. */
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
    MapBuilder.of("topPose", MapBuilder.of("registrationName", "onPose"))
}
