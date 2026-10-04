import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1791111600000 implements MigrationInterface {
  name = 'CreateVideos1791111600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "videos" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "channel_id" uuid NOT NULL,
      "title" character varying(255) NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'draft',
      "storage_key" character varying(255) NOT NULL,
      "thumbnail_key" character varying(255),
      "upload_id" text,
      "expected_size" bigint NOT NULL,
      "actual_size" bigint,
      "content_type" character varying(255) NOT NULL,
      "original_filename" character varying(255) NOT NULL,
      "duration_seconds" double precision,
      "metadata" jsonb,
      "error_message" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_videos_id" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_videos_storage_key" UNIQUE ("storage_key"),
      CONSTRAINT "CHK_videos_status" CHECK ("status" IN ('draft','processing','ready','error')),
      CONSTRAINT "CHK_videos_expected_size" CHECK ("expected_size" > 0 AND "expected_size" <= 10000000000)
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_channel_id" ON "videos" ("channel_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_channel_id" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_channel_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_videos_channel_id"`);
    await queryRunner.query(`DROP TABLE "videos"`);
  }
}
