declare module "youtube-transcript/dist/youtube-transcript.esm.js" {
  export type TranscriptConfig = import("youtube-transcript").TranscriptConfig;
  export type TranscriptResponse = import("youtube-transcript").TranscriptResponse;

  export class YoutubeTranscript {
    static fetchTranscript(
      videoId: string,
      config?: TranscriptConfig,
    ): Promise<TranscriptResponse[]>;
  }
}

