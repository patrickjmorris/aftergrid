BEGIN { FS=","; OFS="\t" }
NR==1 {
  if ($0 != "period,channel,eligible_sessions,signups") { bad=1; exit }
  next
}
{
  p=$1; c=$2
  if (NF!=4 || (p!="baseline" && p!="current") || c=="" ||
      $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ || $3<=0 || $4>$3 || seen[p,c]++) {
    bad=1; exit
  }
  channels[c]=1
  n[p,c]=$3; y[p,c]=$4
  total_n[p]+=$3; total_y[p]+=$4
  rows++
}
END {
  if (bad || rows!=4 || total_n["baseline"]<=0 || total_n["current"]<=0) {
    print "ERROR: invalid input"; exit 1
  }
  for (c in channels) {
    if (!seen["baseline",c] || !seen["current",c]) {
      print "ERROR: unmatched channels"; exit 1
    }
  }
  print "Validated: four unique period/channel rows; positive session counts; integer signups within sessions; matched channels."
  print "period", "sessions", "signups", "conversion_pct"
  printf "baseline\t%d\t%d\t%.4f\n", total_n["baseline"], total_y["baseline"], 100*total_y["baseline"]/total_n["baseline"]
  printf "current\t%d\t%d\t%.4f\n", total_n["current"], total_y["current"], 100*total_y["current"]/total_n["current"]
  print "channel", "baseline_weight_pct", "current_weight_pct", "baseline_rate_pct", "current_rate_pct", "rate_change_pp", "mix_contribution_pp", "within_contribution_pp"
  for (c in channels) {
    w0=n["baseline",c]/total_n["baseline"]
    w1=n["current",c]/total_n["current"]
    r0=y["baseline",c]/n["baseline",c]
    r1=y["current",c]/n["current",c]
    fixed_base+=w0*r1
    fixed_current+=w1*r0
    mix+=(w1-w0)*r0
    within+=w1*(r1-r0)
    interaction+=(w1-w0)*(r1-r0)
    printf "%s\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\t%.4f\n", c, 100*w0, 100*w1, 100*r0, 100*r1, 100*(r1-r0), 100*(w1-w0)*r0, 100*w1*(r1-r0)
  }
  base=total_y["baseline"]/total_n["baseline"]
  curr=total_y["current"]/total_n["current"]
  printf "Observed change: %.4f percentage points; %.4f percent relative; %+d signups.\n", 100*(curr-base), 100*(curr/base-1), total_y["current"]-total_y["baseline"]
  printf "Baseline weights, current rates: %.4f%%.\n", 100*fixed_base
  printf "Current weights, baseline rates: %.4f%%; %.0f counterfactual signups at current volume.\n", 100*fixed_current, fixed_current*total_n["current"]
  printf "Exact decomposition (baseline rates for mix; current weights for within): mix %+.4f pp, within %+.4f pp, sum %+.4f pp.\n", 100*mix, 100*within, 100*(mix+within)
  printf "Interaction term: %.4f pp.\n", 100*interaction
  printf "At equal 10000-session volumes: mix %+.0f signups; within %+.0f signups.\n", mix*total_n["current"], within*total_n["current"]
  residual=curr-base-mix-within
  if (residual>0.000000001 || residual< -0.000000001) {
    print "ERROR: decomposition does not reconcile"; exit 1
  }
  print "PASS: decomposition reconciles with observed change."
}
