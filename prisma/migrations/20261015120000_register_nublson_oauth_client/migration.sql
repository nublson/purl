-- Register the nublson.com portfolio as a public OAuth client (links:save scope).
-- Data only and additive; safe to run twice.
INSERT INTO "oauthApplication" ("id","name","clientId","clientSecret","redirectUrls","type","disabled","createdAt","updatedAt")
VALUES ('nublson-com','nublson.com','nublson-com',NULL,'https://nublson.com/purl/callback,http://localhost:3000/purl/callback','public',false,NOW(),NOW())
ON CONFLICT ("clientId") DO NOTHING;
