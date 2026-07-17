/**
 * Book file selection rules:
 *   - A book must have at least one of pdfKey/epubKey.
 *   - Enforced in the API route layer.
 */

export type BookFileSelection = {
  pdfKey: string | null;
  epubKey: string | null;
  coverImageKey?: string | null;
};

export class BookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookValidationError";
  }
}

export class BookValidator {
  static validateFiles(files: BookFileSelection): void {
    if (!files.pdfKey && !files.epubKey) {
      throw new BookValidationError(
        "A book must include at least one PDF or EPUB file."
      );
    }
  }
}
