import { describe, expect, it } from "vitest";

import { isValidUploadShape, mediaBucket } from "./media-storage";

describe("isValidUploadShape", () => {
  it("accepts the exact shape every real upload produces: configured bucket, 3 segments", () => {
    expect(isValidUploadShape(mediaBucket, "user-id/client-documents/uuid.pdf")).toBe(true);
  });

  it("rejects a bucket other than the one real configured bucket", () => {
    expect(isValidUploadShape("some-other-bucket", "user-id/client-documents/uuid.pdf")).toBe(
      false
    );
  });

  it("rejects a path with fewer than 3 segments", () => {
    expect(isValidUploadShape(mediaBucket, "user-id/uuid.pdf")).toBe(false);
  });

  it("rejects a path with more than 3 segments", () => {
    expect(isValidUploadShape(mediaBucket, "user-id/client-documents/nested/uuid.pdf")).toBe(
      false
    );
  });
});
