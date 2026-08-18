import {
  matchResults, normalizedPayload, isUnreliablePlaceholder, ZXING, DBR,
} from "../src/score.mjs";

function check(cond, message) {
  if (!cond) throw new Error(message);
}

check(normalizedPayload("CODE_39", "*8974589*") === "8974589", "code39 asterisks");
check(normalizedPayload("CODE_128", "{GS}8952180") === "8952180", "code128 gs");
check(normalizedPayload("QR_CODE", "t=1&amp;s=2\n") === "t=1&s=2", "html and newline");
check(normalizedPayload("QR_CODE", "\\000001https://example") === "https://example", "nul escape");
check(isUnreliablePlaceholder("^"), "placeholder");

let matches = matchResults(
  [{ format: "CODE_39", text: "*8974589*", decode_eligible: true }],
  [{ format: "CODE_39", text: "8974589" }],
  ZXING,
);
check(matches[0].outcome === "correct", "zxing code39 match");

matches = matchResults(
  [{ format: "CODE_128", text: "8952180", decode_eligible: true }],
  [{ format: "CODE_128", text: "{GS}8952180" }],
  DBR,
);
check(matches[0].outcome === "correct", "dbr gs match");

matches = matchResults(
  [{ format: "PDF_417", text: "^", decode_eligible: true }],
  [{ format: "PDF_417", text: "M1FORTIN" }],
  DBR,
);
check(matches[0].outcome === "extra_result", "placeholder excluded");
console.log("ok");
