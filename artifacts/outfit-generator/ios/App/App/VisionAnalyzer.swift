import Foundation
import Vision
import UIKit
import Capacitor

/**
 * VisionAnalyzer — inline Capacitor plugin.
 *
 * Exposes a single `analyze` method that runs:
 *   - VNClassifyImageRequest  (confidence ≥ 0.3)
 *   - VNRecognizeTextRequest  (accurate mode)
 *
 * Both requests run synchronously on a background queue.
 * Falls back silently to empty arrays on any error.
 *
 * Setup:
 *   1. Add VisionAnalyzer.swift + VisionAnalyzerPlugin.m to the Xcode target.
 *   2. Xcode → Build Phases → Compile Sources: confirm both files are listed.
 *   3. Xcode → General → Frameworks, Libraries…: Vision.framework is linked.
 *      (It is usually auto-linked but verify if build fails.)
 */
@objc(VisionAnalyzer)
public class VisionAnalyzer: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VisionAnalyzer"
    public let jsName = "VisionAnalyzer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "analyze", returnType: CAPPluginReturnPromise)
    ]

    @objc func analyze(_ call: CAPPluginCall) {
        guard let imageDataUrl = call.getString("imageDataUrl") else {
            call.resolve(["labels": [], "text": []])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            guard
                let commaIndex = imageDataUrl.firstIndex(of: ","),
                let base64Data = Data(
                    base64Encoded: String(imageDataUrl[imageDataUrl.index(after: commaIndex)...]),
                    options: .ignoreUnknownCharacters
                ),
                let uiImage = UIImage(data: base64Data),
                let cgImage = uiImage.cgImage
            else {
                call.resolve(["labels": [], "text": []])
                return
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            var labels: [String] = []
            var recognizedText: [String] = []

            // Classification
            let classifyRequest = VNClassifyImageRequest()

            // Text recognition
            let textRequest = VNRecognizeTextRequest()
            textRequest.recognitionLevel = .accurate

            do {
                try handler.perform([classifyRequest, textRequest])

                if let observations = classifyRequest.results {
                    labels = observations
                        .filter { $0.confidence >= 0.3 }
                        .map { $0.identifier }
                }

                if let textObservations = textRequest.results {
                    recognizedText = textObservations
                        .compactMap { $0.topCandidates(1).first?.string }
                        .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
                }
            } catch {
                // Fall back silently — text search still works
            }

            call.resolve(["labels": labels, "text": recognizedText])
        }
    }
}
