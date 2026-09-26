import Capacitor

/// The web view's controller (SceneDelegate makes one), here only to register the app's own plugins.
class ViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(StopListenerPlugin())
    }
}
