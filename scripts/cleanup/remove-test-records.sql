-- Removes the test records that show on the homepage "Upcoming" section and in GET /api/university-content.
-- REVIEW BEFORE RUNNING. Take a backup first (npm run sql:backup).
-- Safe by default: everything runs in one transaction that ends in ROLLBACK.
-- Read the preview counts, then change the last line to COMMIT to really delete.
-- Every DELETE matches the exact id AND title/description, so a real record that reuses an id is untouched.
SET XACT_ABORT ON;
-- Explicit target confirmation: type the database you mean to clean. Any other database stops here.
DECLARE @expectedDatabase SYSNAME = N'CHANGE_ME';
IF DB_NAME() <> @expectedDatabase THROW 50001, 'Set @expectedDatabase to the database you intend to clean. Nothing was changed.', 1;
BEGIN TRANSACTION;

DECLARE @suffix NVARCHAR(32) = N'eb3a3dbced965dbd';  -- from "Synthetic SQL attendance eb3a3dbced965dbd"
DECLARE @targets TABLE ([id] BIGINT, [_id] CHAR(24));
INSERT INTO @targets ([id], [_id])
SELECT [id], [_id] FROM [dbo].[UniversityContent]
WHERE ([id] = 534314197 AND [title] = N'QR concurrency test' AND [description] = N'Synthetic SQL attendance ' + @suffix)
   OR ([id] = 2 AND [title] = N'Test' AND [description] = N'Tsst')
   OR ([id] = 1 AND [title] = N'intel course' AND [description] = N'intel course in OOA');

-- Preview: what will be removed.
SELECT [id], [type], [title], [description], [date] FROM [dbo].[UniversityContent] WHERE [_id] IN (SELECT [_id] FROM @targets);
SELECT 'EventRegistration' AS [table], COUNT(*) AS [rows] FROM [dbo].[EventRegistration] WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets)
UNION ALL SELECT 'AttendanceRecord', COUNT(*) FROM [dbo].[AttendanceRecord] WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets)
UNION ALL SELECT 'AttendanceSession', COUNT(*) FROM [dbo].[AttendanceSession] WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets)
UNION ALL SELECT 'StudentFeedback', COUNT(*) FROM [dbo].[StudentFeedback] WHERE [targetKey] IN (SELECT [_id] FROM @targets)
UNION ALL SELECT 'StudentAccount (synthetic)', COUNT(*) FROM [dbo].[StudentAccount] WHERE [email] IN (N'qr-a-' + @suffix + N'@example.test', N'qr-b-' + @suffix + N'@example.test')
UNION ALL SELECT 'Club (synthetic)', COUNT(*) FROM [dbo].[Club] WHERE [name] = N'SQL QR test ' + @suffix
UNION ALL SELECT 'AttendanceDeviceBinding (synthetic)', COUNT(*) FROM [dbo].[AttendanceDeviceBinding] WHERE [deviceHash] IN (N'sql-browser-' + @suffix, N'sql-browser-' + @suffix + N'-miu');

-- Rows that belong to the university test events.
DELETE FROM [dbo].[EventRegistration] WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets);
DELETE FROM [dbo].[AttendanceRecord]  WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets);
DELETE FROM [dbo].[AttendanceSession] WHERE [clubId] = 0 AND [eventRequestId] IN (SELECT [id] FROM @targets);
DELETE FROM [dbo].[StudentFeedback]   WHERE [targetKey] IN (SELECT [_id] FROM @targets);
DELETE FROM [dbo].[UniversityContent] WHERE [_id] IN (SELECT [_id] FROM @targets);

-- Other fixtures the same test run may have left (synthetic club, students and device bindings).
DECLARE @clubId FLOAT = (SELECT TOP 1 [id] FROM [dbo].[Club] WHERE [name] = N'SQL QR test ' + @suffix);
IF @clubId IS NOT NULL BEGIN
  DELETE FROM [dbo].[StudentInterest]   WHERE [clubId] = @clubId;
  DELETE FROM [dbo].[AttendanceRecord]  WHERE [clubId] = @clubId;
  DELETE FROM [dbo].[EventRegistration] WHERE [clubId] = @clubId;
  DELETE FROM [dbo].[AttendanceSession] WHERE [clubId] = @clubId;
  DELETE FROM [dbo].[Club] WHERE [id] = @clubId AND [name] = N'SQL QR test ' + @suffix;
END;
DELETE FROM [dbo].[AttendanceDeviceBinding] WHERE [deviceHash] IN (N'sql-browser-' + @suffix, N'sql-browser-' + @suffix + N'-miu');
DELETE FROM [dbo].[StudentAccount] WHERE [email] IN (N'qr-a-' + @suffix + N'@example.test', N'qr-b-' + @suffix + N'@example.test');
-- AuditLog is append-only for the web login; it is intentionally left alone here.

ROLLBACK TRANSACTION;  -- change to COMMIT TRANSACTION after reviewing the preview
