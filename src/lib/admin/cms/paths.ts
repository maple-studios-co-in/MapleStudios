import os from "os";
import path from "path";

/** Where the console keeps its data: one JSON file per collection, plus
    uploaded assets under files/. Serverless hosts mount the deploy read-only,
    so there it is the tmp dir — per-instance and wiped on cold start. */
export const CMS_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "maple-cms")
  : path.join(process.cwd(), "data", "cms");

/** Uploaded media. Shared by the upload, file and delete paths so they can
    never disagree about where an asset lives. */
export const MEDIA_DIR = path.join(CMS_DIR, "files");
