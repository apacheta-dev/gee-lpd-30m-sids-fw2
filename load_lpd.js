/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var geometry = /* color: #eecbaa */ee.Geometry.MultiPoint();
/***** End of imports. If edited, may not auto-convert in the playground. *****/
/* Use this script to load the available three LPD maps for a specific SIDS */

var countryName = 'Barbados'; // Replace this name with one of the available SIDS names in the list below
var ftcADM0Buffer = ee.FeatureCollection("projects/apacheta/assets/SIDS/SIDS_GAUL_1kmBufffer_ADM0");
var ftcCountryBuffer = ftcADM0Buffer.filter(ee.Filter.eq('ADM0_NAME', countryName));

// Replace spaces and parenthesis to create asset id
countryName = countryName.replace(/ /g, '_').replace('(', '_').replace(')', '_');
// Assets ids
var baselinePath = 'projects/apacheta-lpd/assets/LPD_FWv2/LPD_FWv2_' + countryName + '_2000_2015_v1';
var reporting1Path = 'projects/apacheta-lpd/assets/LPD_FWv2/LPD_FWv2_' + countryName + '_2005_2019_v1';
var reporting2Path = 'projects/apacheta-lpd/assets/LPD_FWv2/LPD_FWv2_' + countryName + '_2009_2023_v1';

var imgBaselineLPD = ee.Image(baselinePath);
var imgReporting1LPD = ee.Image(reporting1Path);
var imgReporting2LPD = ee.Image(reporting2Path);

// LPD visualization parameters
var lpd_vispar = { max: 5, min: 0, opacity: 1, palette: ['black', '#f23c46', '#ffae4c', '#ffff73', '#d9d8e6', '#267300'], };
//var lpd_vispar = { max: 5, min: 0, opacity: 1, palette: ['black', '#f23c46', '#ffae4c', '#ffff73', '#eecbaa', '#267300'], };
// lpd_vispar = { max: 5, min: 0, opacity: 1, palette: ['black', '#7b3294', '#c2a5cf', '#ffff73', '#f7f7f7', '#008837'], };
//var lpd_vispar = {min: 1, max: 5, palette: ['#9b2779', '#c0749b', '#e1b9bd', '#ffffe0', '#006500']};

Map.addLayer(imgBaselineLPD, lpd_vispar, 'LPD Baseline: 2000-2015', true);
Map.addLayer(imgReporting1LPD, lpd_vispar, 'LPD Reporting Period 1: 2005-2019', true);
Map.addLayer(imgReporting2LPD, lpd_vispar, 'LPD Reporting Period 2: 2009-2023', true);

//Map.centerObject(ftcCountryBuffer);

// 40 available SIDS to explore
var listSIDS = [
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