export const UPLOAD_START_EVENT = "purl:upload-start";
export const UPLOAD_SUCCESS_EVENT = "purl:upload-success";
export const UPLOAD_ERROR_EVENT = "purl:upload-error";

export type UploadStartDetail = {
  label: string;
};

export type UploadSuccessDetail = {
  id?: string;
};
