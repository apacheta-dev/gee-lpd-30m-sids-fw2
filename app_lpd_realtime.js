/*
This application was built to enable real-time generation of an LPD map for any of the
40 SIDS listed below, using either default or customized parameter settings.  
The process uses the 30-meter LANDSAT Mixed NDVI Gap-Filled time series as input, available from 2000 to 2023.
    
Developed by Apacheta Team .- www.apacheta.org
License: This work is licensed under a Apache License Version 2.0
Please visit this link for more information: https://www.apache.org/licenses/LICENSE-2.0
*/


/*******************************************************************************
 *  *
 ******************************************************************************/
var mdlCreateLPD = require('users/apacheta/LPD_for_SIDS_FW2:LPD_Mixed_GapFillSpatial_30m _FWv2.js');

// Populate list of SIDS using names from GAUL boundaries collection
var ftc0 = ee.FeatureCollection("projects/apacheta/assets/SIDS/SIDS_GAUL_ADM0");
var sidsNames = ftc0.aggregate_array('ADM0_NAME').getInfo();
sidsNames.sort();

// Mixed NDVI collection available years
var initialYear = 2000;
var finalYear = 2023;

// Default SIDS selected
var aoi = { name: 'Saint Lucia' };

// Predefined parameters to create LPD map
var predefinedParams = {
    'Broad Detection Mode': {
        initialBiomass: {
            initialPeriodYears: 3,
            lowBiomass: 0.4,
            highBiomass: 0.7
        },
        steadiness: {
            MannKendallSigLevel: 95,
            MTIDSigLevel: 0,
        },
        state: {
            percentileYears: 15,
            t1t2Years: 4,
            sigPercentilChange: 2,
            sigVIChange: 0.05,
            sigVIChangePerc: 0
        },
        masks: {
            desert: { maxVI: 0.2 },
            water: { years: 5 }
        },
    },
    'Priority Area Mode': {
        initialBiomass: {
            initialPeriodYears: 3,
            lowBiomass: 0.4,
            highBiomass: 0.7
        },
        steadiness: {
            MannKendallSigLevel: 99,
            MTIDSigLevel: 1,
        },
        state: {
            percentileYears: 15,
            t1t2Years: 4,
            sigPercentilChange: 2,
            sigVIChange: 0.05,
            sigVIChangePerc: 0.10
        },
        masks: {
            desert: { maxVI: 0.2 },
            water: { years: 5 }
        }
    },
    'Balanced Mode': {
        initialBiomass: {
            initialPeriodYears: 3,
            lowBiomass: 0.4,
            highBiomass: 0.7
        },
        steadiness: {
            MannKendallSigLevel: 95,
            MTIDSigLevel: 0.5,
        },
        state: {
            percentileYears: 15,
            t1t2Years: 4,
            sigPercentilChange: 2,
            sigVIChange: 0.05,
            sigVIChangePerc: 0.05
        },
        masks: {
            desert: { maxVI: 0.2 },
            water: { years: 5 }
        }
    }
};

// By default startup with High Sensistivity predefined set of params
var defaultSetName = 'Priority Area Mode'
var params = predefinedParams[defaultSetName];

// By default startp with Baseline period
var defaultPeriodName = 'Baseline';
var periods = {
    'Baseline': { fromYear: 2000, toYear: 2015 },
    'Reporting Period 1': { fromYear: 2004, toYear: 2019 },
    'Reporting Period 2': { fromYear: 2008, toYear: 2023 },
};
var period = periods[defaultPeriodName];


var selectedPoint = ee.Geometry.Point(0, 0);
var layersLPD;

// Styles
var sectionStyle = {
    fontWeight: 'bold',
    fontSize: '14px',
    padding: '4px 4px 4px 4px',
    border: '1px solid blue',
    color: 'white',
    backgroundColor: 'blue',
    textAlign: 'left',
    stretch: 'horizontal'
}
var indLabelStyle = { width: '50%', margin: '15px 0px 0px 10px', fontSize: '12px' };
var indTextStyle = { width: '20%', fontSize: '12px' };

// UI components
var pnlControl = ui.Panel({ style: { width: '30%' } });

// App title 
var lblTitle = ui.Label({
    value: 'Real-time 30m LPD map for SIDS',
    style: { fontSize: '20px', fontWeight: 'bold' }
});
var lblSubTitle = ui.Label({
    value: 'This application was built to enable real-time generation of an LPD map for any of the  \
    40 SIDS listed below, using either default or customized parameter settings.  \
    The process uses the 30-meter LANDSAT Mixed NDVI Gap-Filled time series as input, available from 2000 to 2023.',
    style: { fontSize: '12px', margin: '5px 5px' }
});


/* Citation panel */
var lblCite = ui.Label({
    value: 'More info/cite as:',
    targetUrl: '',
    style: { fontSize: '12px', margin: '5px 5px' }
});

var lblDOI = ui.Label({
    value: '10.5281/zenodo.15276520',
    targetUrl: '10.5281/zenodo.15276520',
    style: { fontSize: '12px', margin: '5px 5px' }
});

var pnlCite = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    widgets: [lblCite, lblDOI]
});

/* Report link */
var lblReportLink = ui.Label({
    value: 'Link to the report on how the 30m LANDSAT NDVI time series and LPD maps were created.',
    targetUrl: 'https://drive.google.com/file/d/10nYq6pHmikC6GFuan65bJ5A6QnNry59E/view?usp=sharing',
    style: { fontSize: '12px', margin: '5px 5px' }
});

pnlControl.add(lblTitle);
pnlControl.add(lblSubTitle);
//pnlControl.add(pnlCite);
//pnlControl.add(lblReportLink);

/** More information panel */
var lblInfo = ui.Label('More information about');
var pnlInformation = ui.Panel({
    style: { width: '300px', position: 'top-center', shown: false },
    widgets: [
        lblInfo,
        ui.Button('Close', function () { pnlInformation.style().set({ shown: false }) }
        )]
});

/** Country selection section */
var handleChangeCountry = function (name) {
    if (name !== null) {
        var selectedCountry = ftc0.filter(ee.Filter.eq('ADM0_NAME', name));
        map.centerObject(selectedCountry, 10);
        map.layers().set(layersLPD + 1, ui.Map.Layer(selectedCountry.style({ color: 'black', fillColor: '00000000', width: 1 }), {}, 'Selected SIDS', true));
        lblMsgWarning.setValue('Please click on "Create LPD" to load the LPD map for this country');
      
    }
};
var selCountries = ui.Select({
    style: { width: '40%', fontSize: '12px' },
    items: sidsNames,
    placeholder: 'Select SIDS',
    onChange: handleChangeCountry,
    value: aoi.name
});
var pnlCountry = ui.Panel([
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label({
                value: 'AREA OF INTEREST',
                style: sectionStyle

            }),
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Select SIDS:', { width: '50%', margin: '15px 0px 0px 10px', fontSize: '12px' }),
            selCountries,
        ]
    }),
])
pnlControl.add(pnlCountry);


/** Period selection section */
var fromYearsSelItems = [];
var toYearsSelItems = [];
for (var i = initialYear; i <= finalYear; i++) {
    fromYearsSelItems.push({ label: '' + i, value: i });
    toYearsSelItems.push({ label: '' + i, value: i });
}
var selFromYear = ui.Select({ items: fromYearsSelItems, value: period.fromYear, style: { fontSize: '12px' } });
var selToYear = ui.Select({ items: toYearsSelItems, value: period.toYear, style: { fontSize: '12px' } });

var selPeriods = ui.Select({
    style: { width: '40%', fontSize: '12px' },
    items: Object.keys(periods),
    placeholder: 'Select period',
    onChange: function (p) {
        selFromYear.setValue(periods[p].fromYear);
        selToYear.setValue(periods[p].toYear);
    },
    value: defaultPeriodName
});

var pnlInputData = ui.Panel([
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label({
                value: 'PERIOD TO ANALYSE',
                style: sectionStyle
            }),
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Predefined periods:', { margin: '15px 0px 0px 10px', fontSize: '12px' }),
            selPeriods
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Initial year:', { margin: '15px 0px 0px 10px', fontSize: '12px' }),
            selFromYear,
            ui.Label('Final year:', { margin: '15px 0px 0px 10px', fontSize: '12px' }),
            selToYear
        ]
    }),
]);
pnlControl.add(pnlInputData);

/** Predefined parameters section */
var handleChangeParameters = function (setName) {

    params = predefinedParams[setName];

    // Change values according to selected predefined parameters set
    // 1-Steadiness
    selMKSignificanceLevel.setValue(params.steadiness.MannKendallSigLevel);
    txtMTIDSigLevel.setValue(params.steadiness.MTIDSigLevel);
    // 2-Initial Biomass
    txtInitialBiomassYears.setValue(params.initialBiomass.initialPeriodYears);
    txtInitialBiomassLow.setValue(params.initialBiomass.lowBiomass);
    txtInitialBiomassHigh.setValue(params.initialBiomass.highBiomass);
    // 3-State
    txtPercentileYears.setValue(params.state.percentileYears);
    txtT1T2Years.setValue(params.state.t1t2Years);
    txtSigPercentileChange.setValue(params.state.sigPercentilChange);
    txtSigVIChange.setValue(params.state.sigVIChange);
    txtSigVIChangePerc.setValue(params.state.sigVIChangePerc);
    // MASKS
    txtMaxVIDesert.setValue(params.masks.desert.maxVI);
    txtYearsWater.setValue(params.masks.water.years);

};

var selParameters = ui.Select({
    style: { width: '40%', fontSize: '12px' },
    items: Object.keys(predefinedParams),
    placeholder: 'Select to load default parameters',
    onChange: handleChangeParameters,
    value: defaultSetName
});

var pnlParameters = ui.Panel([
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Predefined parameters:', { width: '30%', margin: '15px 0px 0px 10px', fontSize: '12px' }),
            selParameters,
            ui.Button('ⓘ',
                function () {
                    lblInfo.setValue('Add info about the 3 predefined sets of parameters to load.');
                    pnlInformation.style().set({ shown: true });
                },
                false, { color: 'blue' })
        ]
    }),
])

/** Subindicators section */
var subIndSteadiness = '1-Steadiness';
var subIndState = '2-State';
var subIndInitialBiomass = '3-Initial Biomass';

// 1-Steadiness sub-section components
var selMKSignificanceLevel = ui.Select({
    style: indTextStyle,
    items: [{ label: '90%', value: 90 }, { label: '95%', value: 95 }, { label: '99%', value: 99 }],
    value: params.steadiness.MannKendallSigLevel,
});

var txtMTIDSigLevel = ui.Textbox({
    value: params.steadiness.MTIDSigLevel,
    style: indTextStyle
});

var pnlSteadiness = ui.Panel([
    ui.Label({
        value: subIndSteadiness,
        style: { fontSize: '16px', fontWeight: 'bold' }
    }),

    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Mann-Kendall significance level:', indLabelStyle),
            selMKSignificanceLevel
        ]
    }),

    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('MTID significance level (0 to 1):', indLabelStyle),
            txtMTIDSigLevel
        ]
    }),
]);

// 2-Sate sub-section components
var txtPercentileYears = ui.Textbox({
    value: params.state.percentileYears,
    style: indTextStyle
});
var txtT1T2Years = ui.Textbox({
    value: params.state.t1t2Years,
    style: indTextStyle
});
var txtSigPercentileChange = ui.Textbox({
    value: params.state.sigPercentilChange,
    style: indTextStyle
});
var txtSigVIChange = ui.Textbox({
    value: params.state.sigVIChange,
    style: indTextStyle
});
var txtSigVIChangePerc = ui.Textbox({
    value: params.state.sigVIChangePerc,
    style: indTextStyle
});

var pnlState = ui.Panel([
    ui.Label({
        value: subIndState,
        style: { fontSize: '16px', fontWeight: 'bold' }
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Years to build percentiles:', indLabelStyle),
            txtPercentileYears,
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Years to consider for initial/final period:  (+/-)', indLabelStyle),
            txtT1T2Years
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Significant percentile change: ', indLabelStyle),
            txtSigPercentileChange,
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Min. significant change in NDVI: ', indLabelStyle),
            txtSigVIChange,
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Min. significant NDVI change in %: ', indLabelStyle),
            txtSigVIChangePerc,
        ]
    })

]);

// 3-Initial Biomass sub-section components
var txtInitialBiomassYears = ui.Textbox({
    value: params.initialBiomass.initialPeriodYears,
    style: indTextStyle
});
var txtInitialBiomassLow = ui.Textbox({
    value: params.initialBiomass.lowBiomass,
    style: indTextStyle
});
var txtInitialBiomassHigh = ui.Textbox({
    value: params.initialBiomass.highBiomass,
    style: indTextStyle
});

var pnlInitialBiomass = ui.Panel([
    ui.Label({
        value: subIndInitialBiomass,
        style: { fontSize: '16px', fontWeight: 'bold' }
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Years to consider for the initial period:', indLabelStyle),
            txtInitialBiomassYears,
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Low initial biomass - NDVI <=', indLabelStyle),
            txtInitialBiomassLow,
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('High initial biomass - NDVI >=', indLabelStyle),
            txtInitialBiomassHigh,
        ]
    }),
]);

var pnlSubIndicators = ui.Panel([
    ui.Label({
        value: 'SUB-INDICATORS',
        style: sectionStyle
    }),
    pnlParameters,
    pnlSteadiness,
    pnlState,
    pnlInitialBiomass
]);

pnlControl.add(pnlSubIndicators);

/** Masks section*/
var txtMaxVIDesert = ui.Textbox({
    value: params.masks.desert.maxVI,
    style: indTextStyle
});
var txtYearsWater = ui.Textbox({
    value: params.masks.water.years,
    style: indTextStyle
});

var pnlMasks = ui.Panel([
    ui.Label({
        value: 'MASKS',
        style: sectionStyle
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Desert: NDVI in the period always <=', indLabelStyle),
            txtMaxVIDesert
        ]
    }),
    ui.Panel({
        layout: ui.Panel.Layout.flow('horizontal'),
        style: { width: '100%', margin: '0px', padding: '0px' },
        widgets: [
            ui.Label('Water: in the period for at least (years) ', indLabelStyle),
            txtYearsWater
        ]
    }),

]);
pnlControl.add(pnlMasks);


var results = {};

//
var lpdPalette = ['black', '#f23c46', '#ffae4c', '#ffff73', '#d9d8e6', '#267300'];
var lpdCategories = ['Non vegetated area', 'Declining', 'Moderate decline', 'Stable but stressed', 'Stable', 'Increasing'];


/** Funcionality to invoke the creation of the LPD map*/
var handleClickCreateLPDMap = function () {
    
    lblMsgWarning.setValue('');
    
    map.clear();
    map.add(pnlInformation);
    map.onClick(handleMapOnClick);
    map.add(createLegendPanel('LPD', lpdPalette, lpdCategories));

    // LPD map parameters     
    period.fromYear = parseInt(selFromYear.getValue());
    period.toYear = parseInt(selToYear.getValue());

    params.steadiness.MannKendallSigLevel = parseInt(selMKSignificanceLevel.getValue());
    params.steadiness.MTIDSigLevel = parseFloat(txtMTIDSigLevel.getValue());

    params.state.percentileYears = parseInt(txtPercentileYears.getValue());
    params.state.t1t2Years = parseInt(txtT1T2Years.getValue());
    params.state.sigPercentilChange = parseInt(txtSigPercentileChange.getValue());
    params.state.sigVIChange = parseFloat(txtSigVIChange.getValue());
    params.state.sigVIChangePerc = parseFloat(txtSigVIChangePerc.getValue());

    params.initialBiomass.initialPeriodYears = parseInt(txtInitialBiomassYears.getValue());
    params.initialBiomass.lowBiomass = parseFloat(txtInitialBiomassLow.getValue());
    params.initialBiomass.highBiomass = parseFloat(txtInitialBiomassHigh.getValue());

    params.masks.desert.maxVI = parseFloat(txtMaxVIDesert.getValue());
    params.masks.water.years = parseInt(txtYearsWater.getValue());

    aoi.name = selCountries.getValue();

    results = mdlCreateLPD.createLPD(params, period, aoi, map);

    layersLPD = map.layers().length();
    map.layers().set(layersLPD, ui.Map.Layer(ee.FeatureCollection(selectedPoint).draw({ color: '#6F20A8', pointRadius: 5 }), {}, 'Selected Point', true));
    var selectedCountry = ftc0.filter(ee.Filter.eq('ADM0_NAME', selCountries.getValue()));
    map.layers().set(layersLPD + 1, ui.Map.Layer(selectedCountry.style({ color: 'black', fillColor: '00000000', width: 1 }), {}, 'Selected SIDS', true));

    lblErrors.setValue('');

    var msg = "LPD process selected parameters:";
    msg += "\nAREA OF INTEREST: " + aoi.name;
    msg += "\n\nPERIOD TO ANALYSE: " + period.fromYear + '-' + period.toYear;

    msg += '\n\nSUB-INDICATORS';
    msg += '\n' + subIndSteadiness;
    msg += '\nTrend calculated using Mann-Kendall';
    msg += '\nSignificance Level (%): ' + params.steadiness.MannKendallSigLevel;
    msg += '\nCategorization calculated using Mann-Kendall & MTID';
    msg += '\nMTID Significance Level (0-1): ' + params.steadiness.MTIDSigLevel;

    msg += '\n\n' + subIndState;
    msg += '\nYears to build percentiles: ' + params.state.percentileYears;
    msg += '\nYears to consider for initial/final period (+/-): ' + params.state.t1t2Years;
    msg += '\nSignificant percentile change: ' + params.state.sigPercentilChange;
    msg += '\nMin. significant change in NDVI: ' + params.state.sigVIChange;
    msg += '\nMin. significant NDVI change in %: ' + params.state.sigVIChangePerc;

    msg += '\n\n' + subIndInitialBiomass;
    msg += '\nYears for initial period: ' + params.initialBiomass.initialPeriodYears;
    msg += '\nLow Biomass: ' + params.initialBiomass.lowBiomass;
    msg += '\nHigh Biomass: ' + params.initialBiomass.highBiomass;


    msg += '\n\nMASKS';
    msg += '\nDesert NDVI in the period less than equal: ' + params.masks.desert.maxVI;
    msg += '\nWater in the period for at least (years): ' + params.masks.water.years;

    lblMsgProcess.setValue(msg);

    lblMsgGeneral.setValue(lblMsgGeneral.getValue() + '\n\nClick on the map if you want to load NDVI charts for a specific point');

    pnlCharts.clear();
};


/** Create LPD button section*/
var pnlCreateLPD = ui.Panel([
    ui.Button({
        label: 'Create LPD map',
        onClick: handleClickCreateLPDMap
    }),
]);
pnlControl.add(pnlCreateLPD);

/* Contact panel */
var lblQuestions = ui.Label({
    value: 'For questions and feedback please contact:',
    style: { fontSize: '12px', margin: '5px 5px' }
});
var lblContact = ui.Label({
    value: 'info@apacheta.org',
    targetUrl: 'mailto: info@apacheta.org',
    style: { fontSize: '12px', margin: '5px 5px' }
});
var pnlContact = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    widgets: [lblQuestions, lblContact]
});
pnlControl.add(pnlContact);

/* Disclaimer */
var lblDisclaimer = ui.Label({
    value: '(*) The boundaries, names, and designations used on maps in this \
     app do not imply any opinion whatsoever from Apacheta LLC regarding the legal status of any country,  \
     territory, city, or area, nor do they imply any opinion concerning the delimitation of frontiers and  \
     boundaries. The mention of specific products, whether or not these have been patented,  \
     does not imply endorsement or recommendation by Apacheta LLC, PISLM, CI or Apacheta Foundation in preference  \
     to others of a similar nature that are not mentioned.',
    style: { fontSize: '12px', margin: '5px 5px' }
});
pnlControl.add(lblDisclaimer);


/** Map panel*/
var map = ui.Map({ style: { width: '70%' } });

/** Messages labels components*/
var lblMsgWarning = ui.Label({ style: { whiteSpace: 'pre', color: 'blue' } });
var lblMsgProcess = ui.Label({ style: { whiteSpace: 'pre' } });
var lblMsgGeneral = ui.Label({ style: { whiteSpace: 'pre' } });
var lblErrors = ui.Label({ style: { whiteSpace: 'pre', color: 'blue' } });
var pnlMessages = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
    widgets: [lblMsgWarning, lblMsgProcess, lblMsgGeneral, lblErrors]
});

/** Charts components*/
var pnlCharts = ui.Panel();

/** Right panel*/
var pnlOutput = ui.Panel({ widgets: [pnlMessages, pnlCharts] });

/** Main panel composition*/
var pnlRoot = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: { height: '100%', width: '100%', },
    widgets: [ui.SplitPanel(pnlControl, ui.Panel(ui.SplitPanel(map, pnlOutput)))]
});


/** When user clicks on the map a point is shown, coordinates are displayed and NDVI chart is created*/
var handleMapOnClick = function (coords) {

    if (results.byYearCal === undefined) {
        lblMsgGeneral.setValue('Please click on "Create LPD" first to load MIXED LANDSAT NDVI collection');
        return;
    }

    // Update the lon/lat panel with values from the click event.
    pnlCharts.clear();
    pnlCharts.add(ui.Label('lat: ' + coords.lat.toFixed(5) + ' lon: ' + coords.lon.toFixed(5)));

    selectedPoint = ee.Geometry.Point(coords.lon, coords.lat);
    map.layers().set(layersLPD, ui.Map.Layer(ee.FeatureCollection(selectedPoint).draw({ color: '#6F20A8', pointRadius: 5 }), {}, 'Selected Point', true));

    var aoiSelected = ftc0.filter(ee.Filter.eq('ADM0_NAME', aoi.name));
    var filter = aoiSelected.filterBounds(selectedPoint);
    lblErrors.setValue('');
    filter.size().getInfo(function (pSize) {
        if (pSize === 0) {
            lblErrors.setValue("Please select a point within the SIDS boundaries or \nre-run the process to calculate and load the LPD layers for the new SIDS selected.");
        }
        else {
            // Create an NDVI annual year chart.
            var chtNDVIAnnual = ui.Chart.image.series(results.byYearCal, selectedPoint, ee.Reducer.mean(), 10);
            chtNDVIAnnual.setOptions({
                title: 'MIXED LANDSAT NDVI annual median - Calendar year',
                vAxis: { title: 'Index * 10000' },
                hAxis: { title: 'Year', format: 'yyyy', gridlines: { count: 7 } },
            });
            pnlCharts.widgets().set(1, chtNDVIAnnual);
        }
    });

};


map.style().set({ cursor: 'crosshair' });
map.onClick(handleMapOnClick);


ui.root.clear();
ui.root.add(pnlRoot);

// At start up create LPD with default predefined set of params and center map to selected SIDS
handleClickCreateLPDMap();
map.centerObject(ftc0.filter(ee.Filter.eq('ADM0_NAME', aoi.name)), 10);


/* Function to create a legend panel for discrete categorized maps */
function createLegendPanel(title, palette, categories) {
    var pnlLegend = ui.Panel({
        style: {
            position: 'bottom-left',
        }
    })
        ;
    var lblTitle = ui.Label({
        value: title,
        style: {
            fontWeight: "bold",
            fontSize: "12px",
            margin: "1px 1px 4px 1px",
            padding: "2px",
        }
    });

    pnlLegend.add(lblTitle);

    var createLegendEntry = function (color, description) {
        var lblColor = ui.Label({
            style: {
                backgroundColor: color,
                padding: "8px",
                margin: "0 0 4px 0",
            }
        });

        var lblDescription = ui.Label({
            value: description,
            style: {
                fontSize: "12px",
                padding: "2px",
                margin: "0 0 4px 0",
            }
        });

        return ui.Panel({
            widgets: [lblColor, lblDescription],
            layout: ui.Panel.Layout.Flow('horizontal')
        });
    };

    palette.forEach(function (color, i) {
        pnlLegend.add(createLegendEntry(color, categories[i]));
    });

    return pnlLegend;
}


