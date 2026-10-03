import {
  mapFolderError,
  parseDescriptionField,
  parseIsPublicField,
  parseEmojiField,
} from "@/lib/folder-errors";
import { deleteFolder, updateFolder } from "@/lib/folders";
import { broadcastLinksChanged } from "@/lib/realtime-broadcast";
import { getSessionUser } from "@/lib/session";
import { type NextRequest, NextResponse } from "next/server";
import { addCors, corsPreflightResponse } from "../../cors";

export async function OPTIONS(): Promise<Response> {
  return corsPreflightResponse();
}

/** Updates a folder: `{ name?, emoji?, description?, isPublic? }` (`null` clears emoji/description; `isPublic` shares it at `/@username/slug`). Same rules and errors as the app's `PATCH /api/folders/[id]`. */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  let body: {
    name?: unknown;
    emoji?: unknown;
    description?: unknown;
    isPublic?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return addCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
  }

  // A present-but-non-string name is treated as blank, so it fails the name
  // rules ("Give your folder a name.") rather than being silently ignored.
  const name =
    body?.name === undefined
      ? undefined
      : typeof body.name === "string"
        ? body.name
        : "";
  const emoji = parseEmojiField(body?.emoji);
  if (emoji instanceof NextResponse) return addCors(emoji);
  const description = parseDescriptionField(body?.description);
  if (description instanceof NextResponse) return addCors(description);
  const isPublic = parseIsPublicField(body?.isPublic);
  if (isPublic instanceof NextResponse) return addCors(isPublic);

  try {
    const { id } = await context.params;
    const folder = await updateFolder(user.id, id, {
      name,
      emoji,
      description,
      isPublic,
    });
    broadcastLinksChanged(user.id);
    return addCors(NextResponse.json(folder));
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return addCors(mapped);
    throw e;
  }
}

/** Deletes a folder. Its links are kept (unfiled) unless `?withLinks=true`, which deletes them too. */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return addCors(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const withLinks = request.nextUrl.searchParams.get("withLinks") === "true";

  try {
    const { id } = await context.params;
    const result = await deleteFolder(user.id, id, { withLinks });
    broadcastLinksChanged(user.id);
    return addCors(NextResponse.json(result));
  } catch (e) {
    const mapped = mapFolderError(e);
    if (mapped) return addCors(mapped);
    throw e;
  }
}
