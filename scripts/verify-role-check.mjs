#!/usr/bin/env node
// Verify role-check logic matches expected behavior.

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); }
  catch (e) { console.error(`  FAIL: ${name} — ${e.message}`); process.exitCode = 1; }
}

function assertEqual(a, b) { if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertThrows(fn, substr) {
  try { fn(); throw new Error("Did not throw"); }
  catch (e) { if (substr && !e.message.includes(substr)) throw new Error(`Expected error containing "${substr}", got "${e.message}"`); }
}

// --- Role check logic (extracted from auth.ts authorize()) ---
const ROLE_LABELS = { ADMIN: "Admin", TEACHER: "Teacher", STUDENT: "Student" };

function checkRole(userRole, expectedRole) {
  if (!expectedRole) {
    throw new Error("Missing expected role");
  }
  if (userRole !== expectedRole) {
    const roleLabel = ROLE_LABELS[userRole] || userRole;
    const expectedLabel = ROLE_LABELS[expectedRole] || expectedRole;
    throw new Error(
      `This account is not a ${expectedLabel} account. Please use the ${roleLabel} login.`
    );
  }
}

// --- Tests ---
console.log("Role check unit tests:");

test("student can log in via student page", () => {
  checkRole("STUDENT", "STUDENT");
});

test("teacher can log in via teacher page", () => {
  checkRole("TEACHER", "TEACHER");
});

test("admin can log in via admin page", () => {
  checkRole("ADMIN", "ADMIN");
});

test("student rejected on teacher page", () => {
  assertThrows(() => checkRole("STUDENT", "TEACHER"), "not a Teacher");
  assertThrows(() => checkRole("STUDENT", "TEACHER"), "Please use the Student login");
});

test("teacher rejected on admin page", () => {
  assertThrows(() => checkRole("TEACHER", "ADMIN"), "not a Admin");
  assertThrows(() => checkRole("TEACHER", "ADMIN"), "Please use the Teacher login");
});

test("admin rejected on student page", () => {
  assertThrows(() => checkRole("ADMIN", "STUDENT"), "not a Student");
  assertThrows(() => checkRole("ADMIN", "STUDENT"), "Please use the Admin login");
});

test("missing expectedRole throws generic error", () => {
  assertThrows(() => checkRole("STUDENT", undefined), "Missing expected role");
});

// --- Error message propagation verification ---
console.log("\nNextAuth error propagation analysis:");

// Simulate what NextAuth server does when authorize() throws
const serverError = new Error("This account is not a Teacher account. Please use the Student login.");
const redirectUrl = `/error?error=${encodeURIComponent(serverError.message)}`;

// Simulate what client does with data.url
const extractedError = new URL(`http://localhost:3000${redirectUrl}`).searchParams.get("error");
assertEqual(extractedError, "This account is not a Teacher account. Please use the Student login.");

// Simulate wrong-password flow
const wrongPwUrl = "/error?error=CredentialsSignin";
const wrongPwError = new URL(`http://localhost:3000${wrongPwUrl}`).searchParams.get("error");
assertEqual(wrongPwError, "CredentialsSignin");

console.log("\n  Client-side error routing:");
console.log(`  "CredentialsSignin".includes("not a") = ${"CredentialsSignin".includes("not a")} → generic message`);
console.log(`  "<custom msg>".includes("not a") = ${extractedError.includes("not a")} → role-mismatch message`);

// --- Overall ---
const status = process.exitCode ? "SOME FAILED" : "ALL PASSED";
console.log(`\n==> ${status}`);
