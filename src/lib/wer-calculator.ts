/**
 * Calculate Word Error Rate (WER) between reference and hypothesis transcripts
 * WER = (Substitutions + Deletions + Insertions) / Total words in reference
 */

// Normalize text for comparison
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .split(' ')
    .filter(word => word.length > 0);
}

// Calculate Levenshtein distance between two word arrays
export function levenshteinDistance(ref: string[], hyp: string[]): number {
  const m = ref.length;
  const n = hyp.length;

  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  // Fill the dp table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],    // Deletion
          dp[i][j - 1],    // Insertion
          dp[i - 1][j - 1] // Substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Calculate Word Error Rate
export function calculateWER(reference: string, hypothesis: string): {
  wer: number;
  accuracy: number;
  referenceWords: number;
  hypothesisWords: number;
  editDistance: number;
  normalizedReference: string;
  normalizedHypothesis: string;
} {
  const refWords = normalizeText(reference);
  const hypWords = normalizeText(hypothesis);

  if (refWords.length === 0) {
    return {
      wer: hypWords.length > 0 ? 100 : 0,
      accuracy: hypWords.length > 0 ? 0 : 100,
      referenceWords: 0,
      hypothesisWords: hypWords.length,
      editDistance: hypWords.length,
      normalizedReference: '',
      normalizedHypothesis: hypWords.join(' ')
    };
  }

  const editDistance = levenshteinDistance(refWords, hypWords);
  const wer = Math.min(100, (editDistance / refWords.length) * 100);
  const accuracy = Math.max(0, 100 - wer);

  return {
    wer: parseFloat(wer.toFixed(2)),
    accuracy: parseFloat(accuracy.toFixed(2)),
    referenceWords: refWords.length,
    hypothesisWords: hypWords.length,
    editDistance,
    normalizedReference: refWords.join(' '),
    normalizedHypothesis: hypWords.join(' ')
  };
}

// Get detailed error analysis
export function getDetailedErrors(reference: string, hypothesis: string): {
  substitutions: string[];
  deletions: string[];
  insertions: string[];
} {
  const refWords = normalizeText(reference);
  const hypWords = normalizeText(hypothesis);

  const m = refWords.length;
  const n = hypWords.length;

  // Create dp table for backtracking
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Track operations
  const ops: string[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(''));

  // Initialize
  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
    if (i > 0) ops[i][0] = 'D'; // Deletion
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
    if (j > 0) ops[0][j] = 'I'; // Insertion
  }

  // Fill tables
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (refWords[i - 1] === hypWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
        ops[i][j] = 'M'; // Match
      } else {
        const costs = [
          dp[i - 1][j] + 1,    // Deletion
          dp[i][j - 1] + 1,    // Insertion
          dp[i - 1][j - 1] + 1 // Substitution
        ];
        const minCost = Math.min(...costs);
        dp[i][j] = minCost;

        if (minCost === costs[0]) ops[i][j] = 'D';
        else if (minCost === costs[1]) ops[i][j] = 'I';
        else ops[i][j] = 'S';
      }
    }
  }

  // Backtrack to find errors
  const substitutions: string[] = [];
  const deletions: string[] = [];
  const insertions: string[] = [];

  let i = m, j = n;
  while (i > 0 || j > 0) {
    const op = ops[i][j];
    if (op === 'M') {
      i--; j--;
    } else if (op === 'S') {
      substitutions.push(`${refWords[i - 1]}→${hypWords[j - 1]}`);
      i--; j--;
    } else if (op === 'D') {
      deletions.push(refWords[i - 1]);
      i--;
    } else if (op === 'I') {
      insertions.push(hypWords[j - 1]);
      j--;
    } else {
      // Handle edge cases
      if (i > 0) {
        deletions.push(refWords[i - 1]);
        i--;
      } else if (j > 0) {
        insertions.push(hypWords[j - 1]);
        j--;
      }
    }
  }

  return {
    substitutions: substitutions.reverse(),
    deletions: deletions.reverse(),
    insertions: insertions.reverse()
  };
}

// Check if WER is within acceptable threshold
export function isAcceptableWER(wer: number, threshold: number = 15): boolean {
  return wer <= threshold;
}