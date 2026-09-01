#!/bin/sh
# Pulls TradingView's licensed Advanced Charts library into
# public/charting_library/ at build time — it's not on npm or any CDN
# (see TRADINGVIEW.md), and it's gitignored on purpose (licensed, not
# ours to commit), so a real deploy has to fetch it fresh here.
#
# Needs TV_GH_TOKEN: a GitHub personal access token belonging to an
# account that's been granted read access to the private
# tradingview/charting_library repo (TRADINGVIEW.md §1). Set it as a
# secret env var on the piptest web service in Render.
#
# Deliberately does not fail the build if the token is missing or the
# clone fails — TVAdvancedChart.jsx already renders a clear "not
# installed" panel instead of a blank chart, so a misconfigured token
# degrades the chart, not the whole site.
set -u

if [ -z "${TV_GH_TOKEN:-}" ]; then
  echo "tv-install: TV_GH_TOKEN not set — skipping. Advanced Charts will show its 'not installed' placeholder."
  exit 0
fi

rm -rf tv-tmp public/charting_library
if git clone --depth 1 "https://${TV_GH_TOKEN}@github.com/tradingview/charting_library.git" tv-tmp; then
  mkdir -p public/charting_library
  cp -R tv-tmp/charting_library/. public/charting_library/
  rm -rf tv-tmp
  echo "tv-install: Advanced Charts installed into public/charting_library/"
else
  echo "tv-install: clone failed (bad/expired TV_GH_TOKEN, or access not yet granted?) — skipping, chart will show its 'not installed' placeholder."
  rm -rf tv-tmp
fi
