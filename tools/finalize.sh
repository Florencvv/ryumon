#!/bin/bash
# bash tools/finalize.sh: concat out/chunks/c_*.mkv -> out/ryumon_silent.mp4 (libx264 High CRF 16 slow, maxrate 36M,
# yuv420p, 24 fps CFR, bt709), then mux the soundtrack out/audio/mix.wav (AAC 192k) -> out/ryumon.mp4
# ffmpeg comes from the FFMPEG env var or PATH.
cd "$(dirname "$0")/.."
NF=2112
FF=${FFMPEG:-ffmpeg}
(cd out/chunks && ls c_*.mkv) | sort | sed "s/^/file '/;s/$/'/" > out/chunks/list.txt
"$FF" -hide_banner -loglevel error -y -f concat -safe 0 -i out/chunks/list.txt -map 0:v \
  -vf "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 16 -maxrate 36M -bufsize 72M -r 24 -fps_mode cfr \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv -x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709 \
  -movflags +faststart out/ryumon_silent.mp4 && echo encoded
echo -n "frames (expect $NF): "
"$FF" -hide_banner -i out/ryumon_silent.mp4 -map 0:v -c copy -f null - 2>&1 | grep -oE "frame= *[0-9]+" | tail -1
if [ -f out/audio/mix.wav ]; then
  "$FF" -hide_banner -loglevel error -y -i out/ryumon_silent.mp4 -i out/audio/mix.wav -map 0:v -map 1:a -c:v copy \
    -c:a aac -b:a 192k -ar 48000 -movflags +faststart out/ryumon.mp4 && echo "muxed out/ryumon.mp4"
else
  echo "no out/audio/mix.wav yet: run python tools/sound/build.py, then this script again"
fi
