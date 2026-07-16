FROM node:20-bookworm
WORKDIR /app

# Install native build deps for sqlite3 + sqlite3 CLI for entrypoint checks
RUN apt-get update && apt-get install -y python3 make g++ sqlite3 && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install --include=dev

# Copy source and build frontend
COPY . .
RUN npm run build

# Create the build-time DB from the repo schema + seed. A clean checkout (CI)
# has no server/*.db — .gitignore excludes them — so the import steps below used
# to find no `coa` table unless the deploy ran from a laptop whose local dev DB
# leaked into the build context. Seed explicitly instead of depending on that.
RUN node server/db/seed.cjs && node server/db/seedAsetTetap.cjs

# Import reference report data from Excel files into the database
# Memory-bounded: the script frees each workbook after use; --expose-gc lets it
# reclaim the large June workbook before reading the next file, and the heap cap
# keeps RSS under the remote builder's limit.
RUN NODE_OPTIONS="--max-old-space-size=512 --expose-gc" node scripts/import_report_data.cjs

# Re-import journals from Excel with multi-line transaction support
RUN node reimport_all_journals.cjs

# Kendala #1 repair: normalize corrupted/empty journal_lines.akun_code against
# COA so every account/sub-account shows its transactions in Buku Besar. Runs on
# the build-time DB (DB_PATH unset here). Idempotent.
RUN node fix_journal_lines_akun_code.cjs

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Runtime
ENV NODE_ENV=production
# PORT is injected by Render (default 3001 for local dev)
EXPOSE 3001
CMD ["./entrypoint.sh"]
