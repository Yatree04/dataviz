#!/usr/bin/env python3
"""Aggregate Digital Earth Pacific's shoreline rates-of-change layer per territory.

Source
------
Release asset `v1.0-dataset` on this repository contains DEP's
`dep_ls_coastlines_0-7-0-55.gpkg`, an OGC GeoPackage (SQLite) whose
`rates_of_change` table holds 2,057,082 DSAS-style transects, 1.97 GB
uncompressed. That file is far too large to commit, so it stays out of the
repository and this script reduces it to the 22-row CSV the page reads:

    python3 tools/build_shoreline.py /path/to/dep_ls_coastlines.gpkg

Every column written below is a count, a median or a percentile over rows in
that table. Nothing is modelled, interpolated or carried across territories.

Three choices, all of them DEP's rather than ours
-------------------------------------------------
* Only transects DEP flags `certainty = 'good'` are counted (65.6% of the
  file). The rest carry DEP's own quality warnings.
* "Retreating" and "accreting" use the cartographic threshold from DEP's
  published QGIS project (`map.qgz`): `sig_time <= 0.01` and
  `abs(rate_time) >= 0.3`. Transects between those bounds are neither, and are
  left uncounted rather than rounded into one side. The choice matters: over
  all transects the regional median rate is +0.115 m/yr, over good ones
  -0.051, over good-and-significant ones -0.173.
* `rate_time` (metres/year) is the only field with full coverage: 0% null
  among good transects in all 22 territories. Net shoreline movement (`nsm`,
  cumulative metres) is null on 40.7% of them, and unevenly: Niue 100% null,
  Nauru 98%, Vanuatu 9.5%. That null is DEP suppressing an untrustworthy
  endpoint pair, not a gap to fill. Where DEP published `nsm` the median
  |last - first| distance is 4.8 m and 0.08% exceed 500 m; where it withheld
  it those become 449.3 m and 48.64%. So `nsm` is carried per territory with
  the share it was published on attached, and never compared across them.

`min_year` and `max_year` are the argmin and argmax of each transect's
distance series, not a start and an end, so they cannot be differenced into a
duration and are not used here.
"""

import csv
import os
import sqlite3
import statistics
import sys

ISO3_TO_ISO2 = {
 'ASM':'AS','COK':'CK','FJI':'FJ','FSM':'FM','GUM':'GU','KIR':'KI','MHL':'MH','MNP':'MP',
 'NCL':'NC','NIU':'NU','NRU':'NR','PCN':'PN','PLW':'PW','PNG':'PG','PYF':'PF','SLB':'SB',
 'TKL':'TK','TON':'TO','TUV':'TV','VUT':'VU','WLF':'WF','WSM':'WS'}
NAME = {
 'AS':'American Samoa','CK':'Cook Islands','FJ':'Fiji','FM':'Micronesia','GU':'Guam',
 'KI':'Kiribati','MH':'Marshall Islands','MP':'Northern Mariana Islands','NC':'New Caledonia',
 'NU':'Niue','NR':'Nauru','PN':'Pitcairn Islands','PW':'Palau','PG':'Papua New Guinea',
 'PF':'French Polynesia','SB':'Solomon Islands','TK':'Tokelau','TO':'Tonga','TV':'Tuvalu',
 'VU':'Vanuatu','WF':'Wallis and Futuna','WS':'Samoa'}

GPKG = sys.argv[1] if len(sys.argv) > 1 else 'dep_ls_coastlines.gpkg'
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'data', 'shoreline_change.csv')

db = sqlite3.connect(GPKG)
rows = []
tot_all = tot_good = tot_ret = tot_acc = 0
all_rates = []
for iso3, iso2 in sorted(ISO3_TO_ISO2.items()):
    n_all, = db.execute("SELECT COUNT(*) FROM rates_of_change WHERE eez_territory=?", (iso3,)).fetchone()
    rates = [r[0] for r in db.execute(
        "SELECT rate_time FROM rates_of_change WHERE eez_territory=? AND certainty='good' AND rate_time IS NOT NULL", (iso3,))]
    sig = [r for r in db.execute(
        "SELECT rate_time, sig_time, nsm FROM rates_of_change WHERE eez_territory=? AND certainty='good'", (iso3,))]
    n_good = len(sig)
    n_ret = sum(1 for r,s,_ in sig if r is not None and s is not None and s <= 0.01 and r <= -0.3)
    n_acc = sum(1 for r,s,_ in sig if r is not None and s is not None and s <= 0.01 and r >=  0.3)
    nsms = [n for _,_,n in sig if n is not None]
    q = statistics.quantiles(rates, n=100, method='inclusive') if len(rates) > 2 else None
    rows.append(dict(
        iso=iso2, iso3=iso3, name=NAME[iso2],
        transects=n_all, good=n_good,
        median_rate=round(statistics.median(rates), 4),
        p10_rate=round(q[9], 4), p25_rate=round(q[24], 4),
        p75_rate=round(q[74], 4), p90_rate=round(q[89], 4),
        retreating=n_ret, accreting=n_acc,
        pct_retreating=round(100*n_ret/n_good, 2),
        pct_accreting=round(100*n_acc/n_good, 2),
        nsm_published=len(nsms),
        pct_nsm_published=round(100*len(nsms)/n_good, 2),
        median_nsm=round(statistics.median(nsms), 2) if nsms else '',
    ))
    tot_all += n_all; tot_good += n_good; tot_ret += n_ret; tot_acc += n_acc
    all_rates += rates

cols = list(rows[0].keys())
with open(OUT, 'w', newline='\n') as f:
    w = csv.DictWriter(f, cols); w.writeheader(); w.writerows(rows)

nul, = db.execute("SELECT COUNT(*) FROM rates_of_change WHERE eez_territory IS NULL").fetchone()
total, = db.execute("SELECT COUNT(*) FROM rates_of_change").fetchone()
print(f"file transects   {total:,}   (unattributed to a territory: {nul:,})")
print(f"summed 22 terrs  {tot_all:,}")
print(f"good certainty   {tot_good:,}  ({100*tot_good/tot_all:.1f}%)")
print(f"sig retreating   {tot_ret:,}  ({100*tot_ret/tot_good:.2f}% of good)")
print(f"sig accreting    {tot_acc:,}  ({100*tot_acc/tot_good:.2f}% of good)")
print(f"region median rate  {statistics.median(all_rates):+.4f} m/yr")
print(f"ratio accreting:retreating  {tot_acc/tot_ret:.2f}")
