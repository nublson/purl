-- What visitors of a folder's shared page first see; null follows the
-- owner's view of the folder ("linkView", else the account's).
ALTER TABLE "folders" ADD COLUMN "sharedView" "LinkView";
