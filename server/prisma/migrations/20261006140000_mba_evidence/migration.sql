-- Historical analyses have unknown counts; never reconstruct them from rounded support.
ALTER TABLE "mba_rules" ADD COLUMN "evidence" JSONB;
