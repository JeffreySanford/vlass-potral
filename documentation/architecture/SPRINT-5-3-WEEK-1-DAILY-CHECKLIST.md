# Sprint 5.3 Week 1 - Daily Checklist

**Ready for**: Monday, February 16 - Friday, February 20, 2026  
**Team**: Cosmic Horizons Developers  
**Objective**: Complete 20 job event publishing tests (Phase 3 Week 1)

---

## Quick Start (Monday Feb 16)

Before beginning work on Monday:

```bash
# 1. Sync with latest code
git pull origin main

# 2. Start infrastructure
pnpm run start:infra

# 3. Verify Kafka topics created
docker exec kafka-1 kafka-topics.sh --list --bootstrap-server localhost:9092

# 4. Run existing tests to establish baseline
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts"

# Expected output: 18 passing tests ✅ (existing tests from last sprint)
```

---

## Monday, February 16 - Day 1

### Morning Setup (09:00 - 12:00)

**Objective**: Prepare service and test file for KafkaService integration

Reading/Reference:

- [ ] Review [SPRINT-5-3-WEEK-1-IMPLEMENTATION-GUIDE.md](SPRINT-5-3-WEEK-1-IMPLEMENTATION-GUIDE.md) - Day 1 section
- [ ] Review [SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md](SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md) - Step 1-3 sections

Code Changes (3 modifications):

- [ ] **Step 1**: Add KafkaService to test module (test file)
- [ ] **Step 2**: Add KafkaService injection to JobOrchestratorService constructor
- [ ] **Step 3**: Add publishing helper methods to JobOrchestratorService

Verification:

```bash
# Compile without errors
pnpm nx build cosmic-horizons-api

# Verify no TypeScript errors
pnpm nx lint cosmic-horizons-api

# Run existing tests (should pass)
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts"
```

Expected: ✅ 18 existing tests still passing

### Afternoon Implementation (13:00 - 17:00)

**Objective**: Add first 3 publishing tests (job.submitted events)

- [ ] Add Test Section: "Job Publishing - Kafka Integration"
- [ ] Add Test Suite: "job.submitted events" (3 tests)
- [ ] Run tests in watch mode: `pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --watch`

Tests to Add:

1. [ ] `should publish job.submitted event with partition key`
2. [ ] `should include job details in job.submitted payload`
3. [ ] `should handle publish failures gracefully`

Expected: ✅ 3 new tests passing (21 total)

### End of Day Checklist (17:00)

- [ ] All 21 tests passing (18 existing + 3 new)
- [ ] No TypeScript errors: `pnpm nx lint cosmic-horizons-api`
- [ ] Commit: `git commit -m "feat: add job.submitted event publishing tests"`
- [ ] Update daily progress below

**Daily Status**:

- Tests Passing: 21/38 ✅
- TypeScript Errors: 0 ✅
- Code Coverage: 90%+ ✅

---

## Tuesday, February 17 - Day 2

### Morning Status Update (09:00 - 09:30)

- [ ] Pull latest changes
- [ ] Run tests to verify Monday changes still working

### Session: Status Transition Events (09:30 - 17:00)

**Objective**: Add 6 status transition tests

Tests to Add:

1. [ ] `should publish job.queued after TACC submission`
2. [ ] `should include TACC job ID in job.queued event`
3. [ ] `should publish job.running event on status change`
4. [ ] `should publish job.completed event with execution time`
5. [ ] `should publish job.failed event with error details`
6. [ ] `should publish job.cancelled event with reason`

Reference: [SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md](SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md) - Test Block 2

Expected: ✅ 6 new tests passing (27 total)

### End of Day Checklist (17:00)

- [ ] All 27 tests passing (18 existing + 3 + 6 new)
- [ ] No TypeScript errors
- [ ] Commit: `git commit -m "feat: add job status transition event publishing tests"`

**Daily Status**:

- Tests Passing: 27/38 ✅
- TypeScript Errors: 0 ✅

---

## Wednesday, February 18 - Day 3

### Morning Status Update (09:00 - 09:30)

- [ ] Pull latest
- [ ] Verify 27 tests still passing

### Session: Partition Keys & Ordering (09:30 - 17:00)

**Objective**: Add 3 partition key and ordering tests

Tests to Add:

1. [ ] `should use job_id as partition key for consistent ordering`
2. [ ] `should handle concurrent jobs with different partition keys`
3. [ ] `should guarantee event ordering within single job lifecycle`

Reference: [SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md](SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md) - Test Block 3

Expected: ✅ 3 new tests passing (30 total)

### End of Day Checklist (17:00)

- [ ] All 30 tests passing (18 existing + 9 new + week so far)
- [ ] No TypeScript errors
- [ ] Commit: `git commit -m "feat: add partition key ordering tests"`

**Daily Status**:

- Tests Passing: 30/38 ✅
- TypeScript Errors: 0 ✅

---

## Thursday, February 19 - Day 4

### Morning Status Update (09:00 - 09:30)

- [ ] Pull latest
- [ ] Verify 30 tests still passing

### Session: Error Handling & Headers (09:30 - 17:00)

**Objective**: Add 5 error handling and header tests

Tests to Add:

1. [ ] `should retry publishing on transient failure`
2. [ ] `should provide meaningful error context`
3. [ ] `should include correlation_id in all events`
4. [ ] `should include timestamps in all events`
5. [ ] `should include user_id in published events`

Reference: [SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md](SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md) - Test Blocks 4-5

Expected: ✅ 5 new tests passing (35 total)

### End of Day Checklist (17:00)

- [ ] All 35 tests passing (18 existing + 17 new)
- [ ] No TypeScript errors
- [ ] Commit: `git commit -m "feat: add error handling and event header tests"`

**Daily Status**:

- Tests Passing: 35/38 ✅
- TypeScript Errors: 0 ✅

---

## Friday, February 20 - Day 5 (Final)

### Morning Status Update (09:00 - 09:30)

- [ ] Pull latest
- [ ] Verify 35 tests still passing

### Session: Final Tests & Validation (09:30 - 15:00)

**Objective**: Add final 3 tests (metrics + integration)

Tests to Add:

1. [ ] `should publish job metrics for completed job`
2. [ ] `should use job_id as partition key for metrics`
3. [ ] `should execute complete job submission → queued flow with both RabbitMQ and Kafka`

Reference: [SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md](SPRINT-5-3-WEEK-1-TEST-ADDITIONS.md) - Test Block 6 & Integration

Expected: ✅ 3 new tests passing (38 total)

### Final Validation (15:00 - 16:00)

**Compliance Checks**:

```bash
# 1. All tests passing
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts"
# Expected: 38 passing ✅

# 2. No TypeScript errors
pnpm nx build cosmic-horizons-api
pnpm nx lint cosmic-horizons-api
# Expected: 0 errors ✅

# 3. Coverage check
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --coverage
# Expected: >90% ✅

# 4. Full API test suite
pnpm nx test cosmic-horizons-api
# Expected: All passing ✅
```

**Deliverables Checklist**:

- [ ] 38 total tests (18 existing + 20 new)
- [ ] All passing: 38/38 ✅
- [ ] TypeScript errors: 0
- [ ] ESLint warnings: 0
- [ ] Code coverage: >90%
- [ ] Code committed to main branch
- [ ] PR ready for review

### Weekly Completion (16:00 - 17:00)

**Documentation**:

- [ ] Update SPRINT-5-3-PROGRESS.md with final status
- [ ] Add completion timestamp
- [ ] Document any findings for Week 2

**Final Commit**:

```bash
git commit -m "feat: complete Sprint 5.3 Week 1 - 20 job event publishing tests

- Added KafkaService integration to JobOrchestratorService
- Implemented 20 comprehensive publishing tests
- Validated partition key ordering guarantees
- Verified error handling and event headers
- All 38 tests passing with >90% coverage
- Ready for Week 2 consumer service integration

Closes: SPRINT-5-3-WEEK-1"
```

- [ ] Create tag: `git tag sprint-5-3-week-1-complete`
- [ ] Push: `git push origin main && git push origin sprint-5-3-week-1-complete`

### End of Week Summary

**Completed**:

- ✅ 20 new publishing tests added
- ✅ KafkaService full integration
- ✅ Partition key ordering validation
- ✅ Error handling implementation
- ✅ All metrics tracking

**Metrics**:

| Metric | Target | Actual |
|--------|--------|--------|
| Tests Passing | 38/38 | 38/38 ✅ |
| TypeScript Errors | 0 | 0 ✅ |
| Code Coverage | >90% | TBD |
| Test Execution | <200ms | TBD |

**Week 1 Status**: ✅ COMPLETE

---

## Quick Command Reference

```bash
# Watch mode (use during development)
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --watch

# Single run (validation)
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts"

# With coverage
pnpm nx test cosmic-horizons-api --testFile="**/job-orchestrator.service.spec.ts" --coverage

# Full build validation
pnpm nx build cosmic-horizons-api && pnpm nx lint cosmic-horizons-api

# Git workflow
git status
git add apps/cosmic-horizons-api/src/app/jobs/services/job-orchestrator.service.spec.ts
git commit -m "feat: add [description of tests added]"
```

---

## Blocker Emergency Contact

**If blocked on**:

- [ ] Test infrastructure → Check kafka-test-builders.ts documentation
- [ ] Kafka connection → Check Docker: `docker ps | grep kafka`
- [ ] Mock service → Verify imports in test file setup
- [ ] TypeScript errors → Run: `pnpm nx build cosmic-horizons-api` for details

---

## Notes Section

**Day 1 Notes**
(add notes)

**Day 2 Notes**
(add notes)

**Day 3 Notes**
(add notes)

**Day 4 Notes**
(add notes)

**Day 5 Notes**
(add notes)

---

## Week 1 Retrospective (Friday EOD)

**What Went Well**
(add notes)

**What Could Improve**
(add notes)

**Lessons for Week 2**
(add notes)

**Ready for Week 2?**: [ ] YES / [ ] NO

---

**Sprint Lead Sign-Off**: _____________________ Date: _________

**Week 1 Status**: ✅ ON TRACK
