import AVFoundation
let a = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let t = a.tracks(withMediaType: .video).first!
print("timeRange", CMTimeGetSeconds(t.timeRange.start), CMTimeGetSeconds(t.timeRange.duration))
for s in t.segments { print("edit", CMTimeGetSeconds(s.timeMapping.source.start), CMTimeGetSeconds(s.timeMapping.target.start), CMTimeGetSeconds(s.timeMapping.target.duration)) }
let r = try! AVAssetReader(asset: a); let o = AVAssetReaderTrackOutput(track: t, outputSettings: nil); r.add(o); r.startReading()
var n = 0
while let sb = o.copyNextSampleBuffer(), n < 4 { if CMSampleBufferGetNumSamples(sb) > 0 { print("pts", CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb))); n += 1 } }
