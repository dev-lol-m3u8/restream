const NodeMediaServer = require("node-media-server");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const express = require("express");

const app = express();
const port = 3000;

// HTTP Configuration
const httpConfig = {
  port: 8000,
  allow_origin: "*",
  mediaroot: "./media",
};

// RTMP Configuration
const rtmpConfig = {
  port: 1935,
  chunk_size: 60000,
  gop_cache: true,
  ping: 10,
  ping_timeout: 60,
};

// Combined Config
const config = {
  http: httpConfig,
  rtmp: rtmpConfig,
};

// Initialize Node Media Server
const nms = new NodeMediaServer(config);

// Handle Stream Transcoding
nms.on("prePublish", async (id, streamPath, args) => {
  console.log(`[NodeMediaServer] Stream connected: ${streamPath}`);

  const streamKey = streamPath.split("/").pop(); // Extract the stream key
  const hlsOutputDir = path.join(__dirname, "media", streamKey); // HLS output directory
  const inputUrl = `rtmp://127.0.0.1:1935${streamPath}`; // RTMP input URL
  const playlistPath = path.join(hlsOutputDir, "index.m3u8");

  // Ensure the output directory exists
  const fs = require("fs");
  fs.mkdirSync(hlsOutputDir, { recursive: true });

  console.log(`[FFmpeg] Starting HLS transcoding for stream key: ${streamKey}`);
  const ffmpegProcess = ffmpeg(inputUrl)
    .outputOptions([
      "-c:v libx264", // Video codec
      "-preset veryfast", // Faster encoding
      "-crf 28", // Quality control
      "-c:a aac", // Audio codec
      "-hls_time 2", // HLS segment duration
      "-hls_list_size 3", // Number of segments in playlist
      "-hls_flags delete_segments", // Auto-delete older segments
    ])
    .output(playlistPath) // Output HLS playlist
    .on("start", (commandLine) => {
      console.log(`[FFmpeg] Command: ${commandLine}`);
    })
    .on("progress", (progress) => {
      console.log(`[FFmpeg] Progress: ${JSON.stringify(progress)}`);
    })
    .on("end", () => {
      console.log(`[FFmpeg] Transcoding finished for stream key: ${streamKey}`);
    })
    .on("error", (err) => {
      console.error(`[FFmpeg] Error for stream key ${streamKey}: ${err.message}`);
    });

  // Run FFmpeg
  ffmpegProcess.run();

  // Stop FFmpeg when the stream disconnects
  nms.on("donePublish", (id, streamPath) => {
    if (streamPath.endsWith(streamKey)) {
      console.log(`[FFmpeg] Stopping transcoding for stream key: ${streamKey}`);
      ffmpegProcess.kill();
    }
  });
});

// Start the server
nms.run();

console.log("NodeMediaServer is running...");

app.use("/media", express.static(path.join(__dirname, "media")));

app.listen(port, () => {
  console.log(`HTTP server running on http://localhost:${port}`);
});
