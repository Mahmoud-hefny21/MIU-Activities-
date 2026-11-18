-- Allow club year plans to travel through the content review chain as ContentRequest type 'year_plan'.
-- Replaces the unnamed type CHECK from 001-platform.sql with a named one, and adds the Club
-- column that records when the approved plan was published. No records are changed.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.Club', N'yearPlanUpdatedAt') IS NULL
  ALTER TABLE dbo.Club ADD [yearPlanUpdatedAt] DATETIME2(3) NULL;
DECLARE @oldCheck SYSNAME = (
  SELECT TOP 1 cc.name FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
  WHERE cc.parent_object_id = OBJECT_ID(N'dbo.ContentRequest') AND c.name = N'type'
    AND cc.definition LIKE N'%entry_permit%' AND cc.definition NOT LIKE N'%year_plan%');
IF @oldCheck IS NOT NULL EXEC(N'ALTER TABLE dbo.ContentRequest DROP CONSTRAINT [' + @oldCheck + N']');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_ContentRequest_Type' AND parent_object_id = OBJECT_ID(N'dbo.ContentRequest'))
  ALTER TABLE dbo.ContentRequest WITH CHECK ADD CONSTRAINT CK_ContentRequest_Type
    CHECK ([type] IS NULL OR [type] IN (N'event', N'feed', N'sponsor', N'booth', N'entry_permit', N'year_plan'));
COMMIT TRANSACTION;
