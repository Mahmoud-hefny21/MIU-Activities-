SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.EventReport',N'eventRequestId') IS NULL
  ALTER TABLE dbo.EventReport ADD [eventRequestId] BIGINT NULL;
IF COL_LENGTH(N'dbo.EventReport',N'eventTitle') IS NULL
  ALTER TABLE dbo.EventReport ADD [eventTitle] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.EventReport',N'eventDate') IS NULL
  ALTER TABLE dbo.EventReport ADD [eventDate] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.EventReport',N'eventLocation') IS NULL
  ALTER TABLE dbo.EventReport ADD [eventLocation] NVARCHAR(MAX) COLLATE Latin1_General_100_BIN2 NULL;
IF COL_LENGTH(N'dbo.EventReport',N'totalParticipants') IS NULL
  ALTER TABLE dbo.EventReport ADD [totalParticipants] FLOAT(53) NULL;
IF COL_LENGTH(N'dbo.EventReport',N'externalBeneficiaries') IS NULL
  ALTER TABLE dbo.EventReport ADD [externalBeneficiaries] FLOAT(53) NULL;
IF COL_LENGTH(N'dbo.EventReport',N'fullyApprovedAt') IS NULL
  ALTER TABLE dbo.EventReport ADD [fullyApprovedAt] DATETIME2(3) NULL;
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_EventReport_totalParticipants_Min')
  EXEC(N'ALTER TABLE dbo.EventReport ADD CONSTRAINT [CK_EventReport_totalParticipants_Min] CHECK ([totalParticipants] IS NULL OR [totalParticipants] >= 0)');
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_EventReport_externalBeneficiaries_Min')
  EXEC(N'ALTER TABLE dbo.EventReport ADD CONSTRAINT [CK_EventReport_externalBeneficiaries_Min] CHECK ([externalBeneficiaries] IS NULL OR [externalBeneficiaries] >= 0)');
DECLARE @oldStatusCheck SYSNAME = (
  SELECT TOP 1 cc.name FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
  WHERE cc.parent_object_id = OBJECT_ID(N'dbo.EventReport') AND c.name = N'status' AND cc.definition NOT LIKE N'%pending_supervisor%');
IF @oldStatusCheck IS NOT NULL EXEC(N'ALTER TABLE dbo.EventReport DROP CONSTRAINT [' + @oldStatusCheck + N']');
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name=N'CK_EventReport_Status')
  EXEC(N'ALTER TABLE dbo.EventReport ADD CONSTRAINT [CK_EventReport_Status] CHECK ([status] IS NULL OR [status] IN (N''draft'', N''submitted'', N''changes_requested'', N''reviewed'', N''pending_supervisor'', N''pending_pr'', N''pending_english'', N''pending_dean'', N''approved''))');
IF OBJECT_ID(N'dbo.EventEvaluation',N'U') IS NULL BEGIN
CREATE TABLE [dbo].[EventEvaluation] (
  [clubId] BIGINT NOT NULL,
  [eventKey] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] NVARCHAR(254) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [rating] FLOAT(53) NOT NULL,
  [comment] NVARCHAR(1000) COLLATE Latin1_General_100_BIN2 NULL,
  [_id] CHAR(24) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [createdAt] DATETIME2(3) NULL,
  [updatedAt] DATETIME2(3) NULL,
  [__v] FLOAT(53) NULL,
  [_payload] NVARCHAR(MAX) NOT NULL CHECK (ISJSON([_payload]) = 1),
  [_version] BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT [PK_EventEvaluation] PRIMARY KEY ([_id]),
  CHECK ([rating] IS NULL OR [rating] >= 1),
  CHECK ([rating] IS NULL OR [rating] <= 5),
  CHECK ([_id] IS NULL OR (LEN([_id]) = 24 AND [_id] NOT LIKE '%[^0-9a-f]%'))
);
CREATE UNIQUE NONCLUSTERED INDEX [IX_EventEvaluation_0_b42a19] ON [dbo].[EventEvaluation] ([clubId] ASC, [eventKey] ASC, [email] ASC);
ALTER TABLE [dbo].[EventEvaluation] ADD [_clubReference] BIGINT NULL;
ALTER TABLE [dbo].[EventEvaluation] ADD CONSTRAINT [CK_EventEvaluation_clubReference] CHECK (([clubId] IS NULL AND [_clubReference] IS NULL) OR ([clubId] = 0 AND [_clubReference] IS NULL) OR ([clubId] <> 0 AND [_clubReference] = [clubId] AND [_clubReference] IS NOT NULL));
ALTER TABLE [dbo].[EventEvaluation] ADD CONSTRAINT [FK_EventEvaluation_Club] FOREIGN KEY ([_clubReference]) REFERENCES [dbo].[Club] ([id]);
END;
IF DATABASE_PRINCIPAL_ID(N'miu_runtime_v1') IS NOT NULL GRANT SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.EventEvaluation TO miu_runtime_v1;
COMMIT TRANSACTION;
