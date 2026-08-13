-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "destinations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'service',
    "location" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL DEFAULT 'seed',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',
    "registry" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "prefix" TEXT NOT NULL DEFAULT '',
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_reports" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "dest_host" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL DEFAULT '',
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',
    "triggered_by" TEXT NOT NULL DEFAULT 'scheduler',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "reachable" BOOLEAN NOT NULL DEFAULT false,
    "ping_success" BOOLEAN NOT NULL DEFAULT false,
    "ping_packets_sent" INTEGER NOT NULL DEFAULT 0,
    "ping_packets_received" INTEGER NOT NULL DEFAULT 0,
    "ping_loss_percent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "ping_min_rtt" DOUBLE PRECISION,
    "ping_max_rtt" DOUBLE PRECISION,
    "ping_avg_rtt" DOUBLE PRECISION,
    "path_fingerprint" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trace_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_hops" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL,
    "ip" TEXT,
    "host" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unreachable',
    "rtts" JSONB NOT NULL DEFAULT '[]',
    "avg_rtt" DOUBLE PRECISION,
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "trace_hops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_events" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "dest_host" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,
    "previous_report_id" TEXT,
    "current_report_id" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_details" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "hop_ttl" INTEGER,
    "old_value" JSONB,
    "new_value" JSONB,
    "message" TEXT NOT NULL,

    CONSTRAINT "change_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ping_samples" (
    "id" TEXT NOT NULL,
    "destination_id" TEXT NOT NULL,
    "dest_host" TEXT NOT NULL,
    "dest_name" TEXT NOT NULL DEFAULT '',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "min_rtt" DOUBLE PRECISION,
    "max_rtt" DOUBLE PRECISION,
    "avg_rtt" DOUBLE PRECISION,
    "loss_percent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "packets_sent" INTEGER NOT NULL DEFAULT 0,
    "packets_received" INTEGER NOT NULL DEFAULT 0,
    "sampled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ping_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "destinations_host_key" ON "destinations"("host");

-- CreateIndex
CREATE INDEX "destinations_category_idx" ON "destinations"("category");

-- CreateIndex
CREATE INDEX "destinations_enabled_idx" ON "destinations"("enabled");

-- CreateIndex
CREATE INDEX "destinations_asn_idx" ON "destinations"("asn");

-- CreateIndex
CREATE INDEX "destinations_company_idx" ON "destinations"("company");

-- CreateIndex
CREATE INDEX "trace_reports_destination_id_started_at_idx" ON "trace_reports"("destination_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "trace_reports_started_at_idx" ON "trace_reports"("started_at" DESC);

-- CreateIndex
CREATE INDEX "trace_reports_reachable_idx" ON "trace_reports"("reachable");

-- CreateIndex
CREATE INDEX "trace_hops_report_id_ttl_idx" ON "trace_hops"("report_id", "ttl");

-- CreateIndex
CREATE INDEX "change_events_destination_id_created_at_idx" ON "change_events"("destination_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "change_events_severity_idx" ON "change_events"("severity");

-- CreateIndex
CREATE INDEX "change_events_created_at_idx" ON "change_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "change_details_event_id_idx" ON "change_details"("event_id");

-- CreateIndex
CREATE INDEX "ping_samples_destination_id_sampled_at_idx" ON "ping_samples"("destination_id", "sampled_at" DESC);

-- CreateIndex
CREATE INDEX "ping_samples_sampled_at_idx" ON "ping_samples"("sampled_at" DESC);

-- AddForeignKey
ALTER TABLE "trace_reports" ADD CONSTRAINT "trace_reports_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_hops" ADD CONSTRAINT "trace_hops_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "trace_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_events" ADD CONSTRAINT "change_events_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_details" ADD CONSTRAINT "change_details_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "change_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ping_samples" ADD CONSTRAINT "ping_samples_destination_id_fkey" FOREIGN KEY ("destination_id") REFERENCES "destinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

