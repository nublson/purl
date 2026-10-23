-- Register the Purl browser extension as public OAuth clients (links:save scope),
-- one per browser, so Settings -> Connected apps names where each connection
-- comes from and each can be disconnected on its own. Their callback is a Purl
-- page the extension watches for and closes.
-- Data only and additive; safe to run twice.
INSERT INTO "oauthApplication" ("id","name","clientId","clientSecret","redirectUrls","type","disabled","createdAt","updatedAt")
VALUES
  ('purl-extension-chrome','Purl for Chrome','purl-extension-chrome',NULL,'https://purl.live/extension/connected,http://localhost:3000/extension/connected','public',false,NOW(),NOW()),
  ('purl-extension-safari','Purl for Safari','purl-extension-safari',NULL,'https://purl.live/extension/connected,http://localhost:3000/extension/connected','public',false,NOW(),NOW())
ON CONFLICT ("clientId") DO NOTHING;
