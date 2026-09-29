import multer from "multer";
import path from "node:path";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { SUPPORTED_EXTENSIONS } from "../services/import/fileDetection.js";

/**
 * Uploads are held in memory only — nothing is written to disk, and the
 * buffer is discarded as soon as the preview response is sent.
 */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.upload.maxBytes, files: 1, fields: 10, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
      cb(
        new AppError(
          "UNSUPPORTED_FILE_TYPE",
          `This file type is not supported. Upload one of: ${SUPPORTED_EXTENSIONS.join(", ")}.`,
        ),
      );
      return;
    }
    cb(null, true);
  },
}).single("file");
