-- MIU Hub: official content can be published as MIU or as a faculty.
-- Adds the publisher columns to UniversityContent. Existing rows keep NULL, which the site reads as MIU.
-- No records are changed.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.UniversityContent', N'publisherType') IS NULL
  ALTER TABLE dbo.UniversityContent ADD [publisherType] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.UniversityContent', N'publisherKey') IS NULL
  ALTER TABLE dbo.UniversityContent ADD [publisherKey] NVARCHAR(60) COLLATE Latin1_General_100_BIN2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_UniversityContent_PublisherType' AND parent_object_id = OBJECT_ID(N'dbo.UniversityContent'))
  EXEC(N'ALTER TABLE dbo.UniversityContent WITH CHECK ADD CONSTRAINT CK_UniversityContent_PublisherType CHECK ([publisherType] IS NULL OR [publisherType] IN (N''miu'', N''faculty''))');
COMMIT TRANSACTION;
