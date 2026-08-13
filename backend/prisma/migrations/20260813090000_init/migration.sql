-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'service',
    "location" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'seed',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',
    "registry" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "prefix" TEXT NOT NULL DEFAULT '',
    "enrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceReport" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "destHost" TEXT NOT NULL,
    "destName" TEXT NOT NULL DEFAULT '',
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "reachable" BOOLEAN NOT NULL DEFAULT false,
    "pingSuccess" BOOLEAN NOT NULL DEFAULT false,
    "pingPacketsSent" INTEGER NOT NULL DEFAULT 0,
    "pingPacketsReceived" INTEGER NOT NULL DEFAULT 0,
    "pingLossPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "pingMinRtt" DOUBLE PRECISION,
    "pingMaxRtt" DOUBLE PRECISION,
    "pingAvgRtt" DOUBLE PRECISION,
    "pathFingerprint" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceHop" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL,
    "ip" TEXT,
    "host" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unreachable',
    "rtts" JSONB NOT NULL DEFAULT '[]',
    "avgRtt" DOUBLE PRECISION,
    "asn" INTEGER,
    "company" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TraceHop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeEvent" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "destHost" TEXT NOT NULL,
    "destName" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,
    "previousReportId" TEXT,
    "currentReportId" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeDetail" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "hopTtl" INTEGER,
    "oldValue" JSONB,
    "newValue" JSONB,
    "message" TEXT NOT NULL,

    CONSTRAINT "ChangeDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingSample" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "destHost" TEXT NOT NULL,
    "destName" TEXT NOT NULL DEFAULT '',
    "success" BOOLEAN NOT NULL DEFAULT false,
    "minRtt" DOUBLE PRECISION,
    "maxRtt" DOUBLE PRECISION,
    "avgRtt" DOUBLE PRECISION,
    "lossPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "packetsSent" INTEGER NOT NULL DEFAULT 0,
    "packetsReceived" INTEGER NOT NULL DEFAULT 0,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PingSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Destination_host_key" ON "Destination"("host");

-- CreateIndex
CREATE INDEX "Destination_category_idx" ON "Destination"("category");

-- CreateIndex
CREATE INDEX "Destination_enabled_idx" ON "Destination"("enabled");

-- CreateIndex
CREATE INDEX "Destination_asn_idx" ON "Destination"("asn");

-- CreateIndex
CREATE INDEX "Destination_company_idx" ON "Destination"("company");

-- CreateIndex
CREATE INDEX "TraceReport_destinationId_startedAt_idx" ON "TraceReport"("destinationId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "TraceReport_startedAt_idx" ON "TraceReport"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "TraceReport_reachable_idx" ON "TraceReport"("reachable");

-- CreateIndex
CREATE INDEX "TraceHop_reportId_ttl_idx" ON "TraceHop"("reportId", "ttl");

-- CreateIndex
CREATE INDEX "ChangeEvent_destinationId_createdAt_idx" ON "ChangeEvent"("destinationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChangeEvent_severity_idx" ON "ChangeEvent"("severity");

-- CreateIndex
CREATE INDEX "ChangeEvent_createdAt_idx" ON "ChangeEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChangeDetail_eventId_idx" ON "ChangeDetail"("eventId");

-- CreateIndex
CREATE INDEX "PingSample_destinationId_sampledAt_idx" ON "PingSample"("destinationId", "sampledAt" DESC);

-- CreateIndex
CREATE INDEX "PingSample_sampledAt_idx" ON "PingSample"("sampledAt" DESC);

-- AddForeignKey
ALTER TABLE "TraceReport" ADD CONSTRAINT "TraceReport_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceHop" ADD CONSTRAINT "TraceHop_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "TraceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEvent" ADD CONSTRAINT "ChangeEvent_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeDetail" ADD CONSTRAINT "ChangeDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ChangeEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PingSample" ADD CONSTRAINT "PingSample_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

