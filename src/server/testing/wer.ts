export function wer(refStr:string, hypStr:string){
  const norm = (s:string)=>s.toLowerCase().replace(/[^a-z0-9\s']/g," ").replace(/\s+/g," ").trim();
  const ref = norm(refStr).split(" ").filter(Boolean);
  const hyp = norm(hypStr).split(" ").filter(Boolean);
  const n = ref.length, m = hyp.length;
  const dp = Array.from({length:n+1},()=>Array(m+1).fill(0));
  for(let i=0;i<=n;i++) dp[i][0] = i;
  for(let j=0;j<=m;j++) dp[0][j] = j;
  for(let i=1;i<=n;i++){
    for(let j=1;j<=m;j++){
      const cost = ref[i-1] === hyp[j-1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + cost
      );
    }
  }
  const dist = dp[n][m];
  return n ? dist / n : (m ? 1 : 0);
}