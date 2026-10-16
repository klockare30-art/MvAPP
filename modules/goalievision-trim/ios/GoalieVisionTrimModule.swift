import AVFoundation
import ExpoModulesCore

/// Cuts a time range out of a recorded video without re-encoding.
///
/// Uses `AVAssetExportPresetPassthrough`: samples are copied as-is, so the clip
/// keeps the original quality and export is fast (seconds, not minutes).
/// AVFoundation keeps the preceding key frame and writes an edit list, so the
/// clip should start at the requested time even when that is not a key frame
/// (to be verified on device).
public class GoalieVisionTrimModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GoalieVisionTrim")

    AsyncFunction("trimAsync") { (sourceUri: String, destinationUri: String, startMs: Double, endMs: Double, promise: Promise) in
      guard let source = URL(string: sourceUri), source.isFileURL,
            let destination = URL(string: destinationUri), destination.isFileURL else {
        promise.reject("ERR_TRIM_URI", "Ogiltig filsökväg.")
        return
      }
      guard endMs > startMs, startMs >= 0 else {
        promise.reject("ERR_TRIM_RANGE", "Ogiltigt tidsintervall.")
        return
      }
      guard FileManager.default.fileExists(atPath: source.path) else {
        promise.reject("ERR_TRIM_SOURCE", "Originalvideon saknas.")
        return
      }

      let asset = AVURLAsset(url: source)
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
        promise.reject("ERR_TRIM_SESSION", "Videon kan inte exporteras.")
        return
      }

      let fileType: AVFileType = destination.pathExtension.lowercased() == "mp4" ? .mp4 : .mov
      guard session.supportedFileTypes.contains(fileType) else {
        promise.reject("ERR_TRIM_TYPE", "Filformatet stöds inte för klippning.")
        return
      }

      // Never overwrite an existing file silently; the caller uses a fresh name.
      if FileManager.default.fileExists(atPath: destination.path) {
        promise.reject("ERR_TRIM_EXISTS", "Målfilen finns redan.")
        return
      }

      session.outputURL = destination
      session.outputFileType = fileType
      // Moves the index to the start of the file so the clip streams quickly in the portal.
      session.shouldOptimizeForNetworkUse = true
      session.timeRange = CMTimeRange(
        start: CMTime(value: CMTimeValue(startMs.rounded()), timescale: 1000),
        end: CMTime(value: CMTimeValue(endMs.rounded()), timescale: 1000)
      )

      session.exportAsynchronously {
        switch session.status {
        case .completed:
          let attributes = try? FileManager.default.attributesOfItem(atPath: destination.path)
          let size = (attributes?[.size] as? NSNumber)?.doubleValue ?? 0
          if size <= 0 {
            try? FileManager.default.removeItem(at: destination)
            promise.reject("ERR_TRIM_EMPTY", "Klippet blev tomt.")
            return
          }
          promise.resolve([
            "uri": destination.absoluteString,
            "sizeBytes": size,
            "durationMs": endMs - startMs,
          ])
        case .cancelled:
          try? FileManager.default.removeItem(at: destination)
          promise.reject("ERR_TRIM_CANCELLED", "Klippningen avbröts.")
        default:
          try? FileManager.default.removeItem(at: destination)
          promise.reject("ERR_TRIM_FAILED", session.error?.localizedDescription ?? "Klippningen misslyckades.")
        }
      }
    }
  }
}
