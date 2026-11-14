import AVFoundation
import AppKit

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let outDir = args[2]
let step = Double(args[3]) ?? 2.0
let asset = AVURLAsset(url: url)
let dur = CMTimeGetSeconds(asset.duration)
print("duration:", dur)
for t in asset.tracks {
    print("track:", t.mediaType.rawValue, "size:", t.naturalSize, "fps:", t.nominalFrameRate, "bitrate:", t.estimatedDataRate)
}
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 960, height: 960)
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
var t = 9999.0
while t < dur {
    let time = CMTime(seconds: t, preferredTimescale: 600)
    if let cg = try? gen.copyCGImage(at: time, actualTime: nil) {
        let rep = NSBitmapImageRep(cgImage: cg)
        let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.7])!
        let name = String(format: "%@/f_%06.2f.jpg", outDir, t)
        try! data.write(to: URL(fileURLWithPath: name))
    }
    t += step
}

// Audio loudness per 0.5s window
if let at = asset.tracks(withMediaType: .audio).first {
    let reader = try! AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: at, outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false,
        AVNumberOfChannelsKey: 1, AVSampleRateKey: 16000])
    reader.add(out); reader.startReading()
    var samples: [Int16] = []
    while let sb = out.copyNextSampleBuffer(), let bb = CMSampleBufferGetDataBuffer(sb) {
        let len = CMBlockBufferGetDataLength(bb)
        var buf = [Int16](repeating: 0, count: len / 2)
        CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: &buf)
        samples += buf
    }
    let win = 1600
    var line = "audio_rms_dbfs_per_0.5s:"
    var i = 0
    while i < samples.count {
        let s = samples[i..<min(i + win, samples.count)]
        var acc: Double = 0
        for v in s { let d = Double(v); acc += d * d }
        let rms: Double = (acc / Double(s.count)).squareRoot()
        let db: Double = rms > 0 ? 20.0 * log10(rms / 32768.0) : -99.0
        line += String(format: " %.0f", db)
        i += win
    }
    print(line)
} else { print("no audio track") }
