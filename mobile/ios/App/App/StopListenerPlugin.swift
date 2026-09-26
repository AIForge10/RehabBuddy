import AVFoundation
import Capacitor
import Speech

/// "It hurts": the microphone as text, for frontend/src/lib/listen.ts. The web
/// view (WKWebView) has no SpeechRecognition of its own, so mobile/src/native.ts
/// wraps this plugin in the same shape and the listener never knows the difference.
///
/// Apple's recognizer transcribes one growing utterance per request, so a pause
/// of `pause` seconds ends the utterance: its text goes to the web side as a
/// final result and a fresh request starts. Recognition stays on the phone when
/// the language supports it (no 1-minute limit, no audio leaving the device);
/// otherwise Apple's servers transcribe it, as Chrome's do with Google.
///
/// Events: `result` {transcript, isFinal} and `end` {error?}. Error codes are the
/// Web Speech API's, which listen.ts already understands: not-allowed,
/// language-not-supported, audio-capture, no-speech, aborted, network.
@objc(StopListenerPlugin)
public class StopListenerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StopListenerPlugin"
    public let jsName = "StopListener"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    /// Silence this long ends an utterance.
    private static let pause: TimeInterval = 0.7

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var pending: DispatchWorkItem?
    private var heard = ""
    private var listening = false

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(engineChanged), name: .AVAudioEngineConfigurationChange, object: engine)
        center.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    // MARK: Calls

    @objc func start(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "en-US"
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.reject("Speech recognition not allowed", "not-allowed")
                return
            }
            Self.requestMicrophone { granted in
                guard granted else {
                    call.reject("Microphone not allowed", "not-allowed")
                    return
                }
                DispatchQueue.main.async { self.begin(language, call) }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.end(error: nil)
            call.resolve()
        }
    }

    private static func requestMicrophone(_ then: @escaping (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: then)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(then)
        }
    }

    // MARK: Listening

    private func begin(_ language: String, _ call: CAPPluginCall) {
        if listening { end(error: nil) }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.isAvailable else {
            call.reject("No speech recognizer for \(language)", "language-not-supported")
            return
        }
        self.recognizer = recognizer

        // Record while the coach keeps talking through the speaker, over any music
        // the patient has on (AppDelegate sets .playback the same way). The category
        // stays this way afterwards: changing it while a clip starts (the coach's
        // "let's stop there" begins the moment listening ends) cuts that clip off.
        let session = AVAudioSession.sharedInstance()
        do {
            if session.category != .playAndRecord {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers, .allowBluetoothA2DP])
            }
            try session.setActive(true)
        } catch {
            call.reject("Couldn't open the microphone", "audio-capture")
            return
        }

        guard startEngine() else {
            call.reject("Couldn't start the microphone", "audio-capture")
            return
        }
        listening = true
        newRequest()
        CAPLog.print("⚡️  StopListener listening (\(language), on device: \(recognizer.supportsOnDeviceRecognition))")
        call.resolve()
    }

    private func startEngine() -> Bool {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return false }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        engine.prepare()
        do {
            try engine.start()
            return true
        } catch {
            input.removeTap(onBus: 0)
            return false
        }
    }

    private func newRequest() {
        task?.cancel()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        if recognizer?.supportsOnDeviceRecognition == true { request.requiresOnDeviceRecognition = true }
        self.request = request
        heard = ""
        task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async { self?.handle(result, error, from: request) }
        }
    }

    private func handle(_ result: SFSpeechRecognitionResult?, _ error: Error?, from request: SFSpeechAudioBufferRecognitionRequest) {
        // A request that was already ended still reports its last words: ignore them.
        guard listening, request === self.request else { return }
        if let result = result {
            let text = result.bestTranscription.formattedString
            if text != heard {
                heard = text
                notifyListeners("result", data: ["transcript": text, "isFinal": false])
            }
            if result.isFinal {
                finishUtterance()
                return
            }
            pending?.cancel()
            let item = DispatchWorkItem { [weak self] in self?.finishUtterance() }
            pending = item
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.pause, execute: item)
        }
        if let error = error as NSError? {
            // Nothing said for a while (1110), or the request was ended (216, 301): just listen on.
            let quiet = error.domain == "kAFAssistantErrorDomain" && [1110, 216, 301].contains(error.code)
            if quiet {
                if !heard.isEmpty { finishUtterance() } else { newRequest() }
            } else {
                end(error: "network")
            }
        }
    }

    /// The utterance so far goes to the web side, and a fresh request begins.
    private func finishUtterance() {
        pending?.cancel()
        pending = nil
        let text = heard
        if !text.isEmpty { notifyListeners("result", data: ["transcript": text, "isFinal": true]) }
        request?.endAudio()
        newRequest()
    }

    private func end(error: String?) {
        guard listening else { return }
        listening = false
        pending?.cancel()
        pending = nil
        task?.cancel()
        task = nil
        request?.endAudio()
        request = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        // The audio session is left as it is (see begin). The pain check's own recorder (getUserMedia) manages its own.
        CAPLog.print("⚡️  StopListener ended \(error ?? "")")
        notifyListeners("end", data: error.map { ["error": $0] } ?? [:])
    }

    // MARK: Route and interruption changes

    /// Headphones in or out, or the web view reconfiguring audio for the coach: the engine has to be started again.
    @objc private func engineChanged() {
        DispatchQueue.main.async {
            guard self.listening else { return }
            if self.startEngine() { self.newRequest() } else { self.end(error: "audio-capture") }
        }
    }

    /// A phone call or Siri took the microphone: the web side restarts the listener when it wants it.
    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        DispatchQueue.main.async { self.end(error: "aborted") }
    }
}
