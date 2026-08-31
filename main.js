document.addEventListener('DOMContentLoaded', async () => {

    const colorRed = '#D95F52';
    const colorBlue = '#4A90E2';
    const colorGold = '#F0AD4E';
    const fontStyle = { fontFamily: 'Inter, sans-serif' };

    // --- 1. Emissions Racing Bar Chart ---
    let dataset = {};
    let racingChart;
    const startYear = 1970;
    const endYear = 2024;
    const btn = document.getElementById('play-pause-button');
    const input = document.getElementById('play-range');
    const nbr = 16;

    function loadCSVData(filePath) {
        return new Promise((resolve, reject) => {
            Papa.parse(filePath, {
                download: true,
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (err) => {
                    reject(err);
                }
            });
        });
    }

    try {
        const ghgData = await loadCSVData('dep_ls_coastlines/GHG_data.csv');
        ghgData.forEach(row => {
            const country = row['Pacific Island Countries and territories'];
            const year = row['TIME_PERIOD'];
            const val = row['OBS_VALUE'];
            if (country && year && val !== undefined && val !== null) {
                if (!dataset[country]) dataset[country] = {};
                dataset[country][year] = Number(val);
            }
        });

        Object.keys(dataset).forEach(c => {
            // Forward fill or just pad with 0 if missing. The data seems dense enough.
            for (let y = startYear; y <= endYear; y++) {
                if (dataset[c][y] === undefined) dataset[c][y] = 0;
            }
        });
    } catch (e) {
        console.error("Error loading CSV:", e);
    }

    (function (H) {
        const FLOAT = /^-?\d+\.?\d*$/;
        H.Fx.prototype.textSetter = function () {
            const chart = H.charts[this.elem.renderer.chartIndex];
            let thousandsSep = chart.numberFormatter('1000.0')[1];
            if (/[0-9]/.test(thousandsSep)) {
                thousandsSep = ' ';
            }
            const replaceRegEx = new RegExp(thousandsSep, 'g');
            let startValue = this.start.replace(replaceRegEx, ''),
                endValue = this.end.replace(replaceRegEx, ''),
                currentValue = this.end.replace(replaceRegEx, '');
            if ((startValue || '').match(FLOAT)) {
                startValue = parseFloat(startValue);
                endValue = parseFloat(endValue);
                currentValue = chart.numberFormatter(
                    startValue + (endValue - startValue) * this.pos,
                    2 // Decimals for emissions
                );
            }
            this.elem.endText = this.end;
            this.elem.attr(this.prop, currentValue, null, true);
        };
        H.SVGElement.prototype.textGetter = function () {
            const ct = this.text.element.textContent || '';
            return this.endText ? this.endText : ct.substring(0, ct.length / 2);
        };
        H.wrap(H.Series.prototype, 'drawDataLabels', function (proceed) {
            const attr = H.SVGElement.prototype.attr,
                chart = this.chart;
            if (chart.sequenceTimer) {
                this.points.forEach(point =>
                    (point.dataLabels || []).forEach(
                        label =>
                        (label.attr = function (hash) {
                            if (hash && hash.text !== undefined && chart.isResizing === 0) {
                                const text = hash.text;
                                delete hash.text;
                                return this.attr(hash).animate({ text });
                            }
                            return attr.apply(this, arguments);
                        })
                    )
                );
            }
            const ret = proceed.apply(
                this,
                Array.prototype.slice.call(arguments, 1)
            );
            this.points.forEach(p =>
                (p.dataLabels || []).forEach(d => (d.attr = attr))
            );
            return ret;
        });
    }(Highcharts));

    function getData(year) {
        const output = Object.entries(dataset)
            .map(country => {
                const [countryName, countryData] = country;
                return [countryName, Number(countryData[year])];
            })
            .sort((a, b) => b[1] - a[1]);
        // include top 'nbr' starting from index 0
        return [output[0], output.slice(0, nbr)];
    }

    function getSubtitle() {
        return `<span style="font-size: 80px; font-weight:700; color: #f0f0f0; font-family:var(--font-heading)">${input.value}</span>`;
    }

    const linearEasing = function (pos) {
        return pos;
    };

    racingChart = Highcharts.chart('chart-emissions', {
        chart: {
            type: 'bar',
            animation: {
                duration: 500,
                easing: linearEasing
            },
            backgroundColor: 'transparent',
            style: fontStyle
        },
        title: {
            text: null
        },
        subtitle: {
            text: getSubtitle(),
            floating: true,
            align: 'right',
            verticalAlign: 'bottom',
            useHTML: true,
            y: 0,
            x: 0
        },
        legend: {
            enabled: false
        },
        xAxis: {
            type: 'category',
            labels: { style: { fontSize: '10px' } },
            lineWidth: 0,
            tickWidth: 0
        },
        yAxis: {
            opposite: false,
            title: {
                text: null
            },
            gridLineDashStyle: 'Solid',
            gridLineColor: '#f0f0f0'
        },
        plotOptions: {
            series: {
                animation: false,
                groupPadding: 0,
                pointPadding: 0.1,
                borderWidth: 0,
                colorByPoint: true,
                colors: [colorRed, colorRed, colorGold, colorGold, colorGold, colorGold, colorGold, colorBlue, colorBlue, colorBlue, colorBlue, colorBlue, colorBlue, colorBlue, colorBlue, colorBlue], // Approximating color spread based on rank
                dataSorting: {
                    enabled: true,
                    matchByName: true
                },
                type: 'bar',
                dataLabels: {
                    enabled: true,
                    format: '{point.y:.1f}'
                }
            }
        },
        series: [
            {
                type: 'bar',
                name: startYear,
                data: dataset && Object.keys(dataset).length ? getData(startYear)[1] : []
            }
        ],
        credits: { enabled: false }
    });

    function pause(button) {
        button.title = 'play';
        button.innerHTML = '▶';
        clearTimeout(racingChart.sequenceTimer);
        racingChart.sequenceTimer = undefined;
    }

    function update(increment) {
        if (increment) {
            input.value = parseInt(input.value, 10) + increment;
        }
        if (input.value >= endYear) {
            pause(btn);
        }
        racingChart.setTitle(void 0, { text: getSubtitle() }, false);
        if (dataset && Object.keys(dataset).length) {
            racingChart.series[0].update({
                name: input.value,
                data: getData(input.value)[1]
            });
        }
    }

    function play(button) {
        button.title = 'pause';
        button.innerHTML = '⏸';
        racingChart.sequenceTimer = setInterval(function () {
            update(1);
        }, 500);
    }

    if (btn) {
        btn.addEventListener('click', function () {
            if (racingChart.sequenceTimer) {
                pause(this);
            } else {
                if (input.value >= endYear) input.value = startYear; // Reset if at end
                play(this);
            }
        });
    }

    if (input) {
        input.addEventListener('click', function () {
            update();
        });
        input.addEventListener('input', function () {
            update();
        });
    }

    // --- 2. Sea Level Lines Chart ---
    try {
        const seaTempData = await loadCSVData('dep_ls_coastlines/sea temp.csv');
        let sstByCountry = {};

        seaTempData.forEach(row => {
            const country = row['Pacific Island Countries and territories'];
            const year = Number(row['TIME_PERIOD']);
            const val = row['OBS_VALUE'];
            const indicator = row['CLIMATE_CHANGE_INDICATORS'];

            if (indicator !== 'ST_ANOM' && indicator !== 'SST_ANOM') return;
            if (!country || !year || val === undefined || val === null) return;

            if (!sstByCountry[country]) sstByCountry[country] = {};
            sstByCountry[country][year] = Number(val);
        });

        // Compute regional mean per year
        let sstYears = {};
        Object.entries(sstByCountry).forEach(([c, years]) => {
            Object.entries(years).forEach(([y, v]) => {
                if (!sstYears[y]) sstYears[y] = { sum: 0, count: 0 };
                sstYears[y].sum += v;
                sstYears[y].count++;
            });
        });

        let sstRegionalMean = {};
        Object.keys(sstYears).forEach(y => {
            sstRegionalMean[y] = sstYears[y].sum / sstYears[y].count;
        });

        const yearsArray = Array.from({ length: 2025 - 1850 + 1 }, (_, i) => 1850 + i);
        let activeTempCountry = 'Marshall Islands';

        const getSeriesData = (country) => {
            return yearsArray.map(y => sstByCountry[country] && sstByCountry[country][y] !== undefined ? sstByCountry[country][y] : null);
        };

        const getMeanData = () => {
            return yearsArray.map(y => sstRegionalMean[y] !== undefined ? sstRegionalMean[y] : null);
        };

        const tempChart = Highcharts.chart('chart-sea-level-lines', {
            chart: {
                type: 'line',
                backgroundColor: 'transparent',
                style: fontStyle,
                height: 380
            },
            title: { text: null },
            xAxis: {
                categories: yearsArray.map(String),
                tickInterval: 25,
                lineWidth: 0,
                tickWidth: 0,
                labels: { style: { fontSize: '10px', color: '#999' } }
            },
            yAxis: {
                title: { text: null },
                min: -1.5,
                max: 1.0,
                tickInterval: 0.5,
                labels: { style: { fontSize: '10px', color: '#999' }, format: '{value}°C' },
                gridLineColor: '#f0f0f0',
                plotLines: [{ value: 0, color: '#ddd', width: 1.5, zIndex: 2 }]
            },
            legend: { enabled: false },
            tooltip: { shared: true, valueDecimals: 2, valueSuffix: '°C' },
            plotOptions: {
                line: {
                    lineWidth: 1.5,
                    marker: { enabled: false }
                }
            },
            series: [{
                name: 'Pacific countries mean',
                color: colorBlue,
                data: getMeanData(),
                zIndex: 2
            }, {
                name: activeTempCountry,
                color: colorGold,
                data: getSeriesData(activeTempCountry),
                zIndex: 1
            }],
            credits: { enabled: false }
        });

        // Pill buttons interactivity
        const buttons = document.querySelectorAll('#temp-country-buttons .pill-button');
        const legendCountry = document.getElementById('temp-legend-country');

        buttons.forEach(btn => {
            btn.addEventListener('click', function () {
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                activeTempCountry = this.getAttribute('data-country');

                tempChart.series[1].update({
                    name: activeTempCountry,
                    data: getSeriesData(activeTempCountry)
                }, true);

                if (legendCountry) {
                    legendCountry.innerHTML = `<div class="legend-dot dot-orange"></div> ` + activeTempCountry;
                }
            });
        });

    } catch (e) {
        console.error("Error loading sea temp data:", e);
    }

    // --- 3. Sea Level Step Chart ---
    Highcharts.chart('chart-sea-level-step', {
        chart: {
            type: 'area',
            backgroundColor: 'transparent',
            style: fontStyle
        },
        title: { text: null },
        xAxis: {
            categories: ['1993', '1995', '1997', '1999', '2001', '2003', '2005', '2007', '2009', '2011', '2013', '2015', '2017', '2019', '2021', '2023'],
            labels: { style: { fontSize: '9px', color: '#999' } },
            tickInterval: 2
        },
        yAxis: {
            title: { text: null },
            min: -0.1,
            max: 0.15,
            tickInterval: 0.05,
            labels: { style: { fontSize: '9px', color: '#999' }, format: '{value}m' },
            gridLineColor: '#f0f0f0'
        },
        legend: { enabled: false },
        plotOptions: {
            area: {
                step: 'left',
                fillColor: {
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                    stops: [
                        [0, 'rgba(74, 144, 226, 0.2)'],
                        [1, 'rgba(74, 144, 226, 0)']
                    ]
                },
                lineColor: colorBlue,
                lineWidth: 2,
                marker: {
                    enabled: true,
                    radius: 3,
                    fillColor: colorBlue
                }
            }
        },
        series: [{
            name: 'Regional Mean',
            data: [-0.05, -0.05, 0, 0, 0.05, 0.05, 0.08, 0.1, 0.1, 0.1, 0.08, 0.1, 0.12, 0.12, 0.15, 0.12]
        }],
        credits: { enabled: false }
    });

    // --- 4. Rainfall Anomaly Diverging Bar Chart ---
    Highcharts.chart('chart-rainfall', {
        chart: {
            type: 'bar',
            backgroundColor: 'transparent',
            style: fontStyle
        },
        title: { text: null },
        xAxis: {
            categories: ['Nauru', 'Kiribati', 'Tuvalu', 'N. Mariana Is', 'Pitcairn', 'Cook Is.', 'New Caledonia', 'Tokelau', 'Marshall Is.', 'Guam', 'Vanuatu', 'Fiji', 'French Polynesia', 'Solomon Is.', 'Palau', 'Papua New Guinea', 'Niue', 'American Samoa', 'Wallis & Futuna', 'Samoa', 'Tonga'],
            labels: { style: { fontSize: '9px' } },
            lineWidth: 0,
            tickWidth: 0
        },
        yAxis: {
            title: { text: null },
            min: -50,
            max: 20,
            tickInterval: 10,
            labels: { style: { fontSize: '9px', color: '#999' }, format: '{value}mm' },
            gridLineColor: '#f0f0f0'
        },
        legend: { enabled: false },
        plotOptions: {
            bar: {
                pointWidth: 8,
                borderWidth: 0,
                colorByPoint: true,
                colors: Array.from({ length: 21 }, (_, i) => i < 7 ? colorRed : colorBlue)
            }
        },
        series: [{
            name: 'Rainfall Anomaly',
            data: [-40, -35, -25, -20, -15, -10, -5, 2, 4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 19, 19.5, 20]
        }],
        credits: { enabled: false }
    });
});
