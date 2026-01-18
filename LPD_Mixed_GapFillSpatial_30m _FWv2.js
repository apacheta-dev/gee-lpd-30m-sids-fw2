/* 
This script runs the Land Productivity Dynamics (LPD) algorithm that was developed by Apacheta Team.
This is a special 30m version with datasets for 2000 - 2023 developed in the context of SIDS.

Developed by Apacheta Team .- www.apacheta.org
License: This work is licensed under a Apache License Version 2.0
Please visit this link for more information: https://www.apache.org/licenses/LICENSE-2.0

*/

// Load Boundaries for SIDS, created from GAUL dataset
var ftcADM0BufferBounds = ee.FeatureCollection("projects/apacheta/assets/SIDS/SIDS_GAUL_1kmBuffferBounds_ADM0"),
    ftcADM0Buffer = ee.FeatureCollection("projects/apacheta/assets/SIDS/SIDS_GAUL_1kmBufffer_ADM0");

// Load water mask image for SIDS
var waterMaskImg = ee.Image('projects/apacheta/assets/NDVI/WaterMask_LPD_SIDS_30m');

var periods = {
    'Baseline': { fromYear: 2000, toYear: 2015 },
    'Reporting Period 1': { fromYear: 2004, toYear: 2019 },
    'Reporting Period 2': { fromYear: 2008, toYear: 2023 },
};

// Example of set of parameters to test this script and create the LPD map
var aoi = { name: 'Antigua and Barbuda' }; // Check SIDS names list below
var period = periods['Baseline']; // or { fromYear: YYYY, toYear: YYYY }
var params = {
    steadiness: {
        MannKendallSigLevel: 99, //options: 90|95|99 default 99
        MTIDSigLevel: 1, // 0 to 1 default 1 
    },
    state: {
        percentileYears: 15, // default 15 years
        t1t2Years: 4, // default 4 years
        sigPercentilChange: 2, // default 2
        sigVIChange: 0.05, // default 0.05 NDVI
        sigVIChangePerc: 0.1 // default 0.1 (10%)
    },
    initialBiomass: {
        initialPeriodYears: 3, // default 3 years
        lowBiomass: 0.4, // default 0.4 NDVI
        highBiomass: 0.7 // default 0.7 NDVI
    },
    masks: {
        desert: { maxVI: 0.2 }, // default 0.2 NDVI
        water: { years: 5 } // default 5 years
    },
};

// List of SIDS names available to test
var SIDS = [
    'Antigua and Barbuda',
    'Bahamas',
    'Bahrain',
    'Barbados',
    'Belize',
    'Cape Verde',
    'Comoros',
    'Cook Islands',
    'Cuba',
    'Dominica',
    'Dominican Republic',
    'Fiji',
    'Grenada',
    'Guinea-Bissau',
    'Guyana',
    'Haiti',
    'Jamaica',
    'Kiribati',
    'Maldives',
    'Marshall Islands',
    'Mauritius',
    'Micronesia (Federated States of)',
    'Nauru',
    'Niue',
    'Palau',
    'Papua New Guinea',
    'Saint Kitts and Nevis',
    'Saint Lucia',
    'Saint Vincent and the Grenadines',
    'Samoa',
    'Sao Tome and Principe',
    'Seychelles',
    'Singapore',
    'Solomon Islands',
    'Suriname',
    'Timor-Leste',
    'Tonga',
    'Trinidad and Tobago',
    'Tuvalu',
    'Vanuatu'
];

/** Function to create a 30m LPD using LANDSAT MIXED NDVI dataset */
var createLPD = function (params, period, aoi, map) {

    var results = {};

    // Load SIDS 1km buffer
    var ftcCountryBuffer = ftcADM0Buffer.filter(ee.Filter.eq('ADM0_NAME', aoi.name));

    // Replace all spaces and parenthesis in the GAUL country name with underscores
    var countryName = aoi.name.replace(/ /g, '_').replace('(', '_').replace(')', '_');

    // Load the 30m LANDSAT MIXED NDVI dataset for the country -  check this script to see how this dataset was created
    var stackMixed = ee.Image("projects/apacheta-lpd/assets/NDVI/MIXED/NDVI_MIXED_" + countryName + "_2000_2023_v1_GapFillSpatial");

    // This script is for standard calendar year and not hydrological year
    var initDate = period.fromYear + '-01-01';
    var endDate = period.toYear + '-12-31';
    //print(initDate, endDate)

    // Make a mask for more permanent water bodies
    var stackMixedWater = stackMixed.lte(0);
    var waterSum = stackMixedWater.reduce(ee.Reducer.sum());
    var waterMask = waterSum.gte(params.masks.water.years);// limit set on 5 years by default
    waterMask = waterMask.add(waterMaskImg.eq(1)).gte(1);

    // Create a collection from the LANDSAT NDVI MIXED dataset (single image with multiple bands)
    var fullCollection = ee.ImageCollection.fromImages(
        ee.List.sequence(2000, 2023).map(function (y) {
            var imgLSYear = stackMixed.select((ee.String('NDVI_').cat(ee.String(ee.Number(y).toInt()))));
            var imgFinal = imgLSYear
                .mask(waterMask.eq(0))
                .toInt16()
                .rename('NDVI')
                .set('year', y)
                .set('system:time_start', ee.Date.fromYMD(y, 1, 1));
            return imgFinal;
        }));

    //print(fullCollection, 'fullCollection');
    if (map !== null)
        map.addLayer(stackMixed, {}, 'LANDSAT MIXED NDVI 2000-2023 (Gap Fill Spatial) ', false);

    // Make the final collection that will be analized for the LPD
    var byYearCal = fullCollection.filterDate(initDate, endDate);
    //print(byYearCal, 'Collection of calendar year means');
    results.byYearCal = byYearCal;

    var subIndSteadiness = '1-Steadiness';
    var subIndState = '2-State';
    var subIndInitialBiomass = '3-Initial Biomass';

    //---------------------------------------------------------------------
    //******************** Calculation starts *****************************
    //---------------------------------------------------------------------

    // SUBINDICATOR 1: STEADINESS

    //-------------------------------------------------------------------------
    //       -----Calculate the significance with MannKendall no parametric------
    // **
    // ** Code to generate temporal ndvi analysis for the project 'Enabling the use of global
    // ** data sources to assess and monitor land degradation at multiple scales' 
    // ** http://www.conservation.org/about/gef/Pages/NDVI.aspx
    // ** by Mariano Gonzalez-Roglich (mgonzalez-roglich@conservation.org)

    // Define Kendal parameter values for a significance of 0.1, 0.05 and  0.01

    var periodMK = period.toYear - period.fromYear + 1;

    var coefficients90 = ee.Array([4, 6, 7, 9, 10, 12, 15, 17, 18, 22, 23, 27,
        28, 32, 35, 37, 40, 42,
        45, 49, 52, 56, 59, 61, 66, 68, 73, 75, 80, 84, 87, 91, 94, 98, 103,
        107, 110, 114, 119, 123, 128, 132, 135, 141, 144, 150, 153, 159,
        162, 168, 173, 177, 182, 186, 191, 197, 202]);
    var coefficients95 = ee.Array([4, 6, 9, 11, 14, 16, 19, 21, 24, 26, 31, 33,
        36, 40, 43, 47, 50, 54,
        59, 63, 66, 70, 75, 79, 84, 88, 93, 97, 102, 106, 111, 115, 120,
        126, 131, 137, 142, 146, 151, 157, 162, 168, 173, 179, 186, 190,
        197, 203, 208, 214, 221, 227, 232, 240, 245, 251, 258]);
    var coefficients99 = ee.Array([6, 8, 11, 15, 18, 22, 25, 29, 34, 38, 41, 47, 50,
        56, 61, 65, 70, 76, 81,
        87, 92, 98, 105, 111, 116, 124, 129, 135, 142, 150, 155, 163, 170,
        176, 183, 191, 198, 206, 213, 221, 228, 236, 245, 253, 260, 268,
        277, 285, 294, 302, 311, 319, 328, 336, 345, 355, 364]);


    // Choose your level of significance:
    var kendalS;
    switch (params.steadiness.MannKendallSigLevel) {
        case 90:
            kendalS = coefficients90.get([periodMK - 4]);
            break;
        case 95:
            kendalS = coefficients95.get([periodMK - 4]);
            break;
        case 99:
            kendalS = coefficients99.get([periodMK - 4]);
            break;
    }

    // ===Mann Kendalls S statistic=========================================================================
    //    This function returns the Mann Kendalls S statistic, assuming that n is less than 40,             
    //  the significance of a calculated S statistic is found in table A.30 of Nonparametric                
    //  Statistical Methods, second edition by Hollander & Wolfe.                                           
    //  reproduced for conveniance:                                                                         
    //  https://www.dropbox.com/s/zc5u3oc1e3ou2me/v2appendixc.pdf?dl=0   _ Thanks Cesar! :-)
    // =====================================================================================================
    var f_MannKendallStat = function (imageCollection) {
        var TimeSeriesList = imageCollection.toList(50);
        var NumberOfItems = TimeSeriesList.length().getInfo();
        var ConcordantArray = [];
        var DiscordantArray = [];
        for (var k = 0; k <= NumberOfItems - 2; k += 1) {
            var CurrentImage = ee.Image(TimeSeriesList.get(k));
            var l = k + 1;
            for (l; l <= NumberOfItems - 1; l += 1) {
                var nextImage = ee.Image(TimeSeriesList.get(l));
                var Concordant = CurrentImage.lt(nextImage);
                ConcordantArray.push(Concordant);
                var Discordant = CurrentImage.gt(nextImage);
                DiscordantArray.push(Discordant);
            }
        }
        var ConcordantSum = ee.ImageCollection(ConcordantArray).sum();
        var DiscordantSum = ee.ImageCollection(DiscordantArray).sum();
        var MKSstat = ConcordantSum.subtract(DiscordantSum);
        return MKSstat;
    };

    // Compute Kendall statistics
    var mk_trend_CalNDVI = f_MannKendallStat(byYearCal.select('NDVI'));

    var mk_palette = { "opacity": 1, "bands": ["NDVI"], "min": -125, "max": 125, "palette": ["d21603", "ffee75", "16ce1b"] };

    if (map !== null)
        map.addLayer(mk_trend_CalNDVI, mk_palette, subIndSteadiness + ': Mann-Kendall trend', false);

    /* Make coded maps  for 3 categories where:
    1: Negative trend - Significative
    2: No significative Trend
    3: Possitive trend - Significative
   */
    var TrajectCalNDVI_MK = ee.Image(0)
        .where(mk_trend_CalNDVI.lt(0).and(mk_trend_CalNDVI.abs().gte(kendalS)), 1) //Significant negative
        .where(mk_trend_CalNDVI.abs().lt(kendalS), 2)                              // No Significant
        .where(mk_trend_CalNDVI.gt(0).and(mk_trend_CalNDVI.abs().gte(kendalS)), 3); // Significant possitive
    //.where(waterMask.eq(1),0)                                                 // No data


    var traject_palette = { "opacity": 1, "bands": ["constant"], "palette": ["080808", "da310b", "fff79c", "33a117"] };
    //map.addLayer(TrajectCalNDVI_MK, traject_palette, 'TrajectCalNDVI_MK', false)
    if (map !== null)
        map.addLayer(TrajectCalNDVI_MK, traject_palette, subIndSteadiness + ': Mann-Kendall final trend (sig-/no sig/sig+)', false);

    var finalTrend = TrajectCalNDVI_MK;

    //-------------
    //// Calculate MTID 
    //-------------------------------------------------------------------------

    // The Multi Temporal Image Differencing (MTID).
    // Traditional way based in (Guo et al. 2008) see below to avoid default
    var MTID = function (imageCollection) {
        var TimeSeriesList = imageCollection.toList(50);
        //  var TimeSeriesList = byMean.toList(50);
        var NumberOfItems = TimeSeriesList.length().getInfo();
        //  print (NumberOfItems,'NumberOfItems')
        var sumArray = [];

        // ------ Choose the Last image Default or not!!!!
        //var lastImage = ee.Image(TimeSeriesList.get(NumberOfItems-1)); // This line is the default considering just last year 

        // Alternative line with more biological meaning/climate meaning
        // the logic is to detect the direction of net change of last period (x years) to reduce outlier impacts 
        var lastImage = imageCollection.select('NDVI')
            .filterMetadata('year', 'greater_than', period.toYear - 3)//last 3 years
            .mean();

        //--------------
        //print (lastImage, 'lastImage')
        for (var k = 0; k <= NumberOfItems - 2; k += 1) {
            var currentImage = ee.Image(TimeSeriesList.get(k));
            sumArray.push(lastImage.subtract(currentImage));
            //print (sumArray,'sumArray')
            //print (currentImage, 'currentImage'+k)
        }
        var finalSum = ee.ImageCollection(sumArray).sum();
        //print (finalSum,'finalSum')
        return finalSum;
    };


    // Compute MTID
    var MTIDNDVI = MTID(byYearCal.select('NDVI'));
    var MTIDmean = byYearCal.select('NDVI').mean().multiply(params.steadiness.MTIDSigLevel); // default 1

    if (map !== null) {
        map.addLayer(MTIDNDVI, { palette: ["d21603", "ffee75", "16ce1b"], min: -5000, max: 5000 }, subIndSteadiness + ': MTDI NDVI', false);
        map.addLayer(MTIDmean, { palette: ["d21603", "ffee75", "16ce1b"], min: -5000, max: 5000 }, subIndSteadiness + ': MTDI mean', false);
    }
    var MTIDcode = MTIDNDVI.lte(0).where(MTIDNDVI.gt(0), 2);
    //              .where(waterMask.eq(1),0)
    if (map !== null)
        map.addLayer(MTIDcode, { min: 1, palette: ["#d21603", "16ce1b"] }, subIndSteadiness + ": MTDI NDVI v1 (1/2)", false);

    var MTIDcode2 = MTIDNDVI.lt(0).and(MTIDNDVI.abs().gte(MTIDmean.abs()))
        .where(MTIDNDVI.abs().lt(MTIDmean.abs()), 2)
        .where(MTIDNDVI.gt(0).and(MTIDNDVI.abs().gte(MTIDmean.abs())), 3);
    //              .where(waterMask.eq(1),0)
    if (map !== null)
        map.addLayer(MTIDcode2, { min: 0, palette: ["black", "d21603", "ffee75", "16ce1b"] }, subIndSteadiness + ": MTDI NDVI v2 (1/2/3)", false);


    ////-----------------------------------------------------------------------
    //// Calculate steadiness 
    //-------------------------------------------------------------------------
    // Calculate the 4 value steadiness index  based on the a combination of Mann-Kendall Trend and MTID
    //where MTID helps when there is no significance

    var steadiness = ee.Image(0)
        .where(finalTrend.eq(1).and(MTIDcode2.eq(1)), 1) // T- MTID-

        .where(finalTrend.eq(1).and(MTIDcode2.eq(3)), 2) // T- MTID+
        .where(finalTrend.eq(1).and(MTIDcode2.eq(2)), 2) // T- MTID0
        .where(finalTrend.eq(2).and(MTIDcode2.eq(1)), 2) // T 0 MTID-

        .where(finalTrend.eq(2).and(MTIDcode2.eq(2)), 3) // T 0 MTID0
        .where(finalTrend.eq(2).and(MTIDcode2.eq(3)), 3) // T 0 MTID+
        .where(finalTrend.eq(3).and(MTIDcode2.eq(1)), 3) // T+ MTID-
        .where(finalTrend.eq(3).and(MTIDcode2.eq(2)), 3) // T+ MTID0

        .where(finalTrend.eq(3).and(MTIDcode2.eq(3)), 4); // T+ MTID+
    //  .where(waterMask.eq(1),0);   

    if (map !== null)
        map.addLayer(steadiness, { min: 0, palette: ["black", "d21603", "#ffa112", "#ffed04", "#18ce2f"] }, subIndSteadiness + " (FINAL): 1/2/3/4 ", false);

    // SUBINDICATOR 2 - STATE

    //*************************************************************************
    //*************************************************************************
    //*************************************************************************
    // Calculation of State o % change performance
    // Baseline and  Initial/End periods size can be changed in the next lines (default is 15 years and 4 years)
    var baselinePerc = period.fromYear + params.state.percentileYears; //default baseline first 15 years
    var initPeriod = period.fromYear + params.state.t1t2Years; //default first 4 years
    var endPeriod = period.toYear - params.state.t1t2Years; //default last 4 years
    // You can also change:
    // 1.- The percentile jump needed to make it significant 
    var jump = params.state.sigPercentilChange; // default 2
    // 2.- Handling small difference: in areas with little variability
    //     percentile jump might be significant with changes too small to have biological meaning  (default 500 that equals NDVI 0.05)

    var smallDiff = params.state.sigVIChange * 10000;// (default NDVI 0.05) /// make it by iniBioLevel
    var smallDiffPer = params.state.sigVIChangePerc;// default 0.10 /// make it by iniBioLevel

    // State Baseline for percentiles
    var NDVImeanTbase = byYearCal.select('NDVI').filterMetadata('year', 'less_than', baselinePerc);

    //print (NDVImeanTbase,'NDVImeanTbase')
    var bl_ndvi_perc = NDVImeanTbase.reduce(ee.Reducer.percentile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));
    //print(bl_ndvi_perc,'bl_ndvi_perc')
    if (map !== null)
        map.addLayer(bl_ndvi_perc, {}, subIndState + ': NDVI mean - Percentiles ' + period.fromYear + ' to ' + (period.fromYear + params.state.percentileYears), false);

    // State Time 1 - Initial period
    var NDVImeanT1 = byYearCal.select('NDVI').filterMetadata('year', 'less_than', initPeriod);
    //print (NDVImeanT1,'NDVImeanT1')

    // State Time 2 - End period
    var NDVImeanT2 = byYearCal.select('NDVI').filterMetadata('year', 'greater_than', endPeriod);
    //print (NDVImeanT2,'NDVImeanT2')

    //get the mean of periods
    var t1_ndvi_mean = NDVImeanT1.mean().rename('ndvi');
    var t2_ndvi_mean = NDVImeanT2.mean().rename('ndvi');

    if (map !== null) {
        map.addLayer(t1_ndvi_mean, {}, subIndState + ': NDVI mean - Baseline Period: ' + period.fromYear + '-' + (period.fromYear + params.state.t1t2Years), false);
        map.addLayer(t2_ndvi_mean, {}, subIndState + ': NDVI mean - Target Period: ' + (period.toYear - params.state.t1t2Years) + '-' + period.toYear, false);
    }

    // Emerging degradation / improvement calculation
    // Reclassify mean NDVI for Initial period based on the percentiles
    var t1_classes = ee.Image(-32768).where(t1_ndvi_mean.lte(bl_ndvi_perc.select('NDVI_p10')), 1)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p10')), 2)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p20')), 3)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p30')), 4)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p40')), 5)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p50')), 6)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p60')), 7)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p70')), 8)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p80')), 9)
        .where(t1_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p90')), 10);

    // Reclassify mean NDVI for End period based on the percentiles
    var t2_classes = ee.Image(-32768).where(t2_ndvi_mean.lte(bl_ndvi_perc.select('NDVI_p10')), 1)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p10')), 2)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p20')), 3)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p30')), 4)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p40')), 5)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p50')), 6)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p60')), 7)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p70')), 8)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p80')), 9)
        .where(t2_ndvi_mean.gt(bl_ndvi_perc.select('NDVI_p90')), 10);


    var classesStyle = {
        min: 1, max: 10, palette: [
            "#ff0000", // red
            "#ff5500", // red-orange
            "#ffa700", // orange
            "#ffd000", // golden yellow
            "#fff400", // yellow
            "#dfff00", // yellow-lime
            "#a3ff00", // lime
            "#77dd00", // lime-green
            "#50c100", // yellowish green
            "#2cba00"  // green
        ]
    };
    if (map !== null) {
        map.addLayer(t1_classes.mask(t1_classes.neq(-32768)), classesStyle, subIndState + ': NDVI mean - Baseline Period (Recl. 1 to 10)', false);
        map.addLayer(t2_classes.mask(t2_classes.neq(-32768)), classesStyle, subIndState + ': NDVI mean - Target Period (Recl.1 to 10)', false);
    }


    // Emerging state: difference between start and end clusters >= 2 percentile
    var classes_chg = t2_classes.subtract(t1_classes).updateMask(t1_ndvi_mean.neq(-32768));

    var emeState = ee.Image(0).where(classes_chg.lte(-1 * jump), 1)                            // negative
        .where(classes_chg.gt(-1 * jump).and(classes_chg.lt(jump)), 2)   // stable
        .where(classes_chg.gte(jump), 3)                           //  possitive
        .where(t1_ndvi_mean.subtract(t2_ndvi_mean).abs().lte(smallDiff), 2)//Deal with small differences
        .where(t1_ndvi_mean.subtract(t2_ndvi_mean).abs().lte(t1_ndvi_mean.multiply(smallDiffPer)), 2);//Deal with small differences

    if (map !== null)
        map.addLayer(emeState, { min: 0, max: 3, palette: ['#000000', "d21603", "ffee75", "16ce1b"] }, subIndState + ' (FINAL): -/stable/+', false);

    // SUBINDICATOR 3 - INITIAL BIOMASS
    //*************************************************************************
    //*************************************************************************
    //*************************************************************************
    // Calculation of initial Biomass
    // For small areas using the Mean and Standard deviation can provide a statistically based threshold 
    // At natinoal level this parameter can be fitted using expert knowledge to delineate 3 main regions

    var NDVIinitialMean = byYearCal.select('NDVI')
        .filterMetadata('year', 'less_than', period.fromYear + params.initialBiomass.initialPeriodYears)// default first 3 years
        .mean()
        .divide(10000);

    var lowBio = ee.Number(params.initialBiomass.lowBiomass);
    var highBio = ee.Number(params.initialBiomass.highBiomass);

    var initialBiomass = ee.Image(0)
        .where(NDVIinitialMean.lte(lowBio), 1) // Low
        .where(NDVIinitialMean.gt(lowBio).and(NDVIinitialMean.lte(highBio)), 2) // medium
        .where(NDVIinitialMean.gte(highBio), 3);  // high

    if (map !== null)
        map.addLayer(initialBiomass.mask(initialBiomass.neq(0)), { min: 1, palette: ["d21603", "ffee75", "16ce1b"] }, subIndInitialBiomass + ' (FINAL): low/medium/high ', false);


    //*************************************************************************
    //*************************************************************************
    //*************************************************************************
    // Calculation of Final expression
    /*
    Logical tabulation/combination of 4 steadiness classes, 
    with 3 classes (low, medium, high) of initial standing biomass 
    and 3 classes of change of GPP proxy between beginning and end of time series - State
    to 36 combinations and assignment to the final 5 LPD classes
    */

    var semifinal_lpd = ee.Image().expression(
        '(a == 1 && b==1 && c==1 )?1:' + //1
        '(a == 1 && b==2 && c==1 )?2:' + //2
        '(a == 1 && b==3 && c==1 )?3:' + //3
        '(a == 1 && b==1 && c==2 )?4:' + //4
        '(a == 1 && b==2 && c==2 )?5:' + //5
        '(a == 1 && b==3 && c==2 )?6:' + //6
        '(a == 1 && b==1 && c==3 )?7:' + //7
        '(a == 1 && b==2 && c==3 )?8:' + //8
        '(a == 1 && b==3 && c==3 )?9:' + //9
        '(a == 2 && b==1 && c==1 )?10:' + //10
        '(a == 2 && b==2 && c==1 )?11:' + //11
        '(a == 2 && b==3 && c==1 )?12:' + //12
        '(a == 2 && b==1 && c==2 )?13:' + //13
        '(a == 2 && b==2 && c==2 )?14:' + //14
        '(a == 2 && b==3 && c==2 )?15:' + //15
        '(a == 2 && b==1 && c==3 )?16:' + //16
        '(a == 2 && b==2 && c==3 )?17:' + //17
        '(a == 2 && b==3 && c==3 )?18:' + //18
        '(a == 3 && b==1 && c==1 )?19:' + //19
        '(a == 3 && b==2 && c==1 )?20:' + //20
        '(a == 3 && b==3 && c==1 )?21:' + //21
        '(a == 3 && b==1 && c==2 )?22:' + //22
        '(a == 3 && b==2 && c==2 )?23:' + //23
        '(a == 3 && b==3 && c==2 )?24:' + //24
        '(a == 3 && b==1 && c==3 )?25:' + //25
        '(a == 3 && b==2 && c==3 )?26:' + //26
        '(a == 3 && b==3 && c==3 )?27:' + //27
        '(a == 4 && b==1 && c==1 )?28:' + //28
        '(a == 4 && b==2 && c==1 )?29:' + //29
        '(a == 4 && b==3 && c==1 )?30:' + //30
        '(a == 4 && b==1 && c==2 )?31:' + //31
        '(a == 4 && b==2 && c==2 )?32:' + //32
        '(a == 4 && b==3 && c==2 )?33:' + //33
        '(a == 4 && b==1 && c==3 )?34:' + //34
        '(a == 4 && b==2 && c==3 )?35:' + //35
        '(a == 4 && b==3 && c==3 )?36:99' //36
        ,
        {
            a: steadiness, // Steadiness (1,2,3,4)
            b: initialBiomass, // Initial Biomass (1,2,3)
            c: emeState, // GPP change (1,2,3)
        }
    );

    //print('Semi-Final', semifinal_lpd);
    if (map !== null)
        map.addLayer(semifinal_lpd, {}, 'Semi-final LPD - Classification 1-36', false);

    //Group the 36 categories into the 5 categories of LPD
    var final_lpd = semifinal_lpd.expression(
        '(a > 0 && a<9)?1:' + //1
        '(a > 8 && a<15)?2:' + //2
        '(a > 14 && a<23)?3:' + //3
        '(a > 22 && a<30)?4:' + //4
        '(a > 29 && a<37)?5:0' //5
        , { a: semifinal_lpd }
    );

    //print('Land Productivity Country Image', final_lpd);


    // Make a mask to remove desert areas also need to un-comment the line in the final step that creates LPD
    // alternatively you can make all desert areas also Stable category
    var maxNDVI = byYearCal.filterDate(initDate, endDate).select('NDVI').max();
    var desertMask = maxNDVI.lte(params.masks.desert.maxVI * 10000); // default 0.25 This will identify all areas that in the period never went over 0.25 NDVI;
    if (map !== null) {
        map.addLayer(desertMask, {}, 'Desert Mask', false);
        map.addLayer(waterMask, {}, 'Water Mask', false);
    }
    var LPD = final_lpd
        .where(desertMask.eq(1), 4).updateMask(1) // Desert mask (make sure desertMask line is not commented)
        //        .where(waterMask.eq(1), 0).updateMask(1) // Water mask (make sure waterMask line is not commented)
        //       .where(waterMaskImg.eq(1), 0).updateMask(1) //Water mask from image (make sure waterMask line is not commented)
        .rename('LPD')
        .selfMask()
        .clip(ftcCountryBuffer); // commnet this line if wish to see the global layer

    var LPDWithWater = final_lpd
        .where(desertMask.eq(1), 4).updateMask(1) // Desert mask (make sure desertMask line is not commented)
        .rename('LPD')
        .clip(ftcCountryBuffer); // commnet this line if wish to see the global layer

    //map.centerObject(ftcCountryBuffer, 10, false);

    //Final LPD vis param
    var lpd_vispar = { max: 5, min: 0, opacity: 1, palette: ['black', '#f23c46', '#ffae4c', '#ffff73', '#d9d8e6', '#267300'], };
    if (map !== null) {
        map.addLayer(LPD, lpd_vispar, 'Final LPD FAO (cat 1-5)', true);
        map.addLayer(LPDWithWater, lpd_vispar, 'Final LPD FAO (cat 1-5) - with water', false);
    }

    // Export results 
    var LPDLabel = 'LPD_FWv2_' + countryName + '_' + period.fromYear + '_' + period.toYear + '_v1';
    var ftcCountryBufferBounds = ftcADM0BufferBounds.filter(ee.Filter.eq('ADM0_NAME', aoi.name));

    Export.image.toAsset({
        image: LPD.toByte(),
        description: 'Export_' + LPDLabel,
        assetId: 'projects/apacheta-lpd/assets/LPD_FWv2/' + LPDLabel,
        scale: 30,
        region: ftcCountryBufferBounds,
        maxPixels: 1e13,
        pyramidingPolicy: { '.default': 'mode' },
        crs: 'EPSG:4326'
    });

    return results;
};

exports.createLPD = createLPD;

var map = ui.Map();
ui.root.clear();
ui.root.add(map);


// Run process for single country
//createLPD(params, period, aoi, map);

// Run process to export LPD maps in a loop for country list
/*
SIDS.forEach(function (country) {
    createLPD(params, periods['Baseline'], { name: country }, null);
    createLPD(params, periods['Reporting Period 1'], { name: country }, null);
    createLPD(params, periods['Reporting Period 2'], { name: country }, null);
})
*/
