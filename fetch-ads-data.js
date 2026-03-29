#!/usr/bin/env node
/**
 * fetch-ads-data.js
 * Pulls Google Ads metrics for all WesternVet accounts and writes data.json.
 * Auto-discovers all enabled sub-accounts from MCC, or uses the hardcoded list below.
 * Preserves matchback (mb), cpm, and correlation fields from existing data.json.
 *
 * Requires:  npm install google-ads-api dotenv
 *
 * Environment variables (.env or GitHub Secrets):
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID   (MCC: 8264811884)
 *
 * Usage:  node fetch-ads-data.js
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config();
const { GoogleAdsApi } = require('google-ads-api');

const MCC_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '8264811884';

// ── Full account list (300 enabled accounts from MCC) ─────────────────────────
const ACCOUNTS = [
  { id: "abel", name: "Abel Pet Clinic", cid: "2728843725" },
  { id: "acacia_animal_hospital", name: "Acacia Animal Hospital", cid: "7817938033" },
  { id: "airport_veterinary_clinic", name: "Airport Veterinary Clinic", cid: "2061180966" },
  { id: "all_west_veterinary_hospital_g2", name: "All West Veterinary Hospital G2", cid: "6553742672" },
  { id: "aloha_animal_medical_center", name: "Aloha Animal Medical Center", cid: "7341241597" },
  { id: "alpine_animal_clinic", name: "Alpine Animal Clinic", cid: "7840098597" },
  { id: "animal_blessings_pet_hospital", name: "Animal Blessings Pet Hospital", cid: "9951783588" },
  { id: "animal_care_center_hardin", name: "Animal Care Center, Hardin", cid: "1466472576" },
  { id: "animal_care_of_carters_creek", name: "Animal Care of Carters Creek", cid: "9132265937" },
  { id: "animal_clinic_of_kalispell", name: "Animal Clinic of Kalispell", cid: "3485935586" },
  { id: "animal_hospital_of_laveen", name: "Animal Hospital of Laveen", cid: "6372169968" },
  { id: "animal_medical_center_of_troy", name: "Animal Medical Center of Troy", cid: "5495066856" },
  { id: "arkansas", name: "Arkansas Veterinary Clinic", cid: "9751991111" },
  { id: "aspen_tree_animal_care_center_g1", name: "Aspen Tree Animal Care Center G1", cid: "1615030795" },
  { id: "bay_breeze_animal_clinic_g2", name: "Bay Breeze Animal Clinic G2", cid: "5888570037" },
  { id: "beaumont_animal_clinic", name: "Beaumont Animal Clinic", cid: "2004525962" },
  { id: "bel_aire_veterinary_hospital", name: "Bel-Aire Veterinary Hospital", cid: "5804297649" },
  { id: "bellevue_animal_hospital", name: "Bellevue Animal Hospital", cid: "4314092137" },
  { id: "blackhawk_veterinary_hospital_g1", name: "Blackhawk Veterinary Hospital G1", cid: "5707202654" },
  { id: "branson_veterinary_hospital_g1", name: "Branson Veterinary Hospital G1", cid: "3675135315" },
  { id: "brier_veterinary_hospital", name: "Brier Veterinary Hospital", cid: "3113844023" },
  { id: "burlingame_road_animal_hospital", name: "Burlingame Road Animal Hospital", cid: "6310645597" },
  { id: "cherrelyn", name: "Cherrelyn Animal Hospital", cid: "9422023847" },
  { id: "chewelah_veterinary_clinic", name: "Chewelah Veterinary Clinic", cid: "3729834545" },
  { id: "chimney_rock_animal_hospital_g1", name: "Chimney Rock Animal Hospital G1", cid: "5576333780" },
  { id: "cimarron", name: "Cimarron Animal Hospital", cid: "3135177197" },
  { id: "circle_l_animal_hospital", name: "Circle L Animal Hospital", cid: "9401375460" },
  { id: "city_pets_vet", name: "City Pets Vet", cid: "6799301286" },
  { id: "claremont_veterinary_hospital", name: "Claremont Veterinary Hospital", cid: "1046475605" },
  { id: "community_animal_hospital", name: "Community Animal Hospital", cid: "8521171321" },
  { id: "companion_pet_hospital", name: "Companion Pet Hospital", cid: "4743194237" },
  { id: "companion_veterinary_hospital", name: "Companion Veterinary Hospital", cid: "9375679882" },
  { id: "council_veterinary_hospital", name: "Council Veterinary Hospital", cid: "6065216449" },
  { id: "country_view_veterinary_clinic", name: "Country View Veterinary Clinic", cid: "6889451119" },
  { id: "country_view_veterinary_hospital", name: "Country View Veterinary Hospital", cid: "6994561982" },
  { id: "crestwood_crossing_animal_hospital", name: "Crestwood Crossing Animal Hospital", cid: "8740107597" },
  { id: "dallas_animal_clinic", name: "Dallas Animal Clinic", cid: "1994789119" },
  { id: "doctors_office_for_pets", name: "Doctors Office for Pets", cid: "4625190695" },
  { id: "east_bend_animal_hospital", name: "East Bend Animal Hospital", cid: "9720098309" },
  { id: "east_and_west_ridge_animal_hospital", name: "East and West Ridge Animal Hospital", cid: "4926615686" },
  { id: "fallbrook_animal_hospital", name: "Fallbrook Animal Hospital", cid: "6069004882" },
  { id: "family_pet_hospital", name: "Family Pet Hospital", cid: "9704613337" },
  { id: "first_capitol_animal_hospital", name: "First Capitol Animal Hospital", cid: "2430870509" },
  { id: "forest_grove_veterinary_clinic", name: "Forest Grove Veterinary Clinic", cid: "3256392297" },
  { id: "goldenview_veterinary_hospital", name: "GoldenView Veterinary Hospital", cid: "9063891782" },
  { id: "hammocks_veterinary_hospital", name: "Hammocks Veterinary Hospital", cid: "4214442999" },
  { id: "hatton_veterinary_hospital", name: "Hatton Veterinary Hospital", cid: "9364056229" },
  { id: "hayden_pet_medical_center", name: "Hayden Pet Medical Center", cid: "8195346307" },
  { id: "hillside_veterinary_associates", name: "Hillside Veterinary Associates", cid: "5157887744" },
  { id: "hometown_animal_clinic", name: "Hometown Animal Clinic", cid: "3449115719" },
  { id: "island_cats_veterinary_hospital_g1", name: "Island Cats Veterinary Hospital G1", cid: "1953517811" },
  { id: "ithaca_animal_hospital", name: "Ithaca Animal Hospital", cid: "6654294192" },
  { id: "jenks_veterinary_hospital", name: "Jenks Veterinary Hospital", cid: "2823664360" },
  { id: "kierland_animal_clinic_g1", name: "Kierland Animal Clinic G1", cid: "5432034070" },
  { id: "kingman_animal_hospital", name: "Kingman Animal Hospital", cid: "1100439156" },
  { id: "kings", name: "Kings Trail Animal Hospital", cid: "1707255460" },
  { id: "laurel", name: "Laurel Pet Hospital", cid: "6947947454" },
  { id: "los_lunas_animal_clinic", name: "Los Lunas Animal Clinic", cid: "7412652445" },
  { id: "loving_family_animal_hospital_g2", name: "Loving Family Animal Hospital G2", cid: "7911019601" },
  { id: "mill_creek_veterinary_hospital", name: "Mill Creek Veterinary Hospital", cid: "8463170603" },
  { id: "moreland_animal_hospital", name: "Moreland Animal Hospital", cid: "9046124003" },
  { id: "north_phoenix_animal_clinic", name: "North Phoenix Animal Clinic", cid: "5727585303" },
  { id: "ohana_pet_hospital_of_agoura_hills", name: "Ohana Pet Hospital of Agoura Hills", cid: "7146796192" },
  { id: "pacific_veterinary_clinic", name: "Pacific Veterinary Clinic", cid: "6928813080" },
  { id: "palo_duro_animal_hospital", name: "Palo Duro Animal Hospital", cid: "9053490993" },
  { id: "park_city_animal_clinic", name: "Park City Animal Clinic", cid: "2205779619" },
  { id: "parkview_cat_clinic", name: "Parkview Cat Clinic", cid: "7134081152" },
  { id: "pavillion_animal_hospital", name: "Pavillion Animal Hospital", cid: "2772546391" },
  { id: "pawsitive_veterinary_care", name: "Pawsitive Veterinary Care", cid: "1310981449" },
  { id: "payson", name: "Payson Family Pet Hospital", cid: "7717887648" },
  { id: "pinebrook_animal_hospital", name: "Pinebrook Animal Hospital", cid: "4469752641" },
  { id: "pontchartrain_animal_hospital", name: "Pontchartrain Animal Hospital", cid: "3177191803" },
  { id: "reidsville_veterinary_hospital", name: "Reidsville Veterinary Hospital", cid: "1382340117" },
  { id: "reynolds_road_animal_hospital", name: "Reynolds Road Animal Hospital", cid: "3977503172" },
  { id: "richland_animal_hospital", name: "Richland Animal Hospital", cid: "2673418086" },
  { id: "river_valley_animal_hospital_g1", name: "River Valley Animal Hospital G1", cid: "2930734729" },
  { id: "rowland_veterinary_services", name: "Rowland Veterinary Services", cid: "5958982082" },
  { id: "san_juan_veterinary_hospital", name: "San Juan Veterinary Hospital", cid: "2623151227" },
  { id: "sanford_oaks_animal_clinic", name: "Sanford Oaks Animal Clinic", cid: "6638592748" },
  { id: "santa_rosa_veterinary_hospital", name: "Santa Rosa Veterinary Hospital", cid: "1427938060" },
  { id: "sonoran_veterinary_center", name: "Sonoran Veterinary Center", cid: "4000016525" },
  { id: "south_arlington_animal_clinic", name: "South Arlington Animal Clinic", cid: "5367641315" },
  { id: "south_texas_veterinary_clinic", name: "South Texas Veterinary Clinic", cid: "4143207819" },
  { id: "southpark_animal_clinic", name: "SouthPark Animal Clinic", cid: "3576267090" },
  { id: "southgate_veterinary_hospital", name: "Southgate Veterinary Hospital", cid: "7173897043" },
  { id: "stetson_hills_animal_hospital", name: "Stetson Hills Animal Hospital", cid: "7444278566" },
  { id: "summerlin_animal_hospital", name: "Summerlin Animal Hospital", cid: "5472199786" },
  { id: "tanglewilde_veterinary_clinic_g3", name: "Tanglewilde Veterinary Clinic G3", cid: "7503336623" },
  { id: "touhy_animal_hospital", name: "Touhy Animal Hospital", cid: "3644080311" },
  { id: "union_park_veterinary_hospital", name: "Union Park Veterinary Hospital", cid: "9094303701" },
  { id: "vetcare_animal_hospital", name: "VetCare Animal Hospital", cid: "9193705343" },
  { id: "village_pet_doctor", name: "Village Pet Doctor", cid: "4609544050" },
  { id: "vineyard_veterinary_hospital", name: "Vineyard Veterinary Hospital", cid: "2486729192" },
  { id: "wellshire_animal_hospital", name: "Wellshire Animal Hospital", cid: "7120900048" },
  { id: "west_main_animal_hospital", name: "West Main Animal Hospital", cid: "2998959380" },
  { id: "westside_pet_hospital", name: "Westside Pet Hospital", cid: "5647891148" },
  { id: "wickenburg_veterinary_clinic", name: "Wickenburg Veterinary Clinic", cid: "1683236531" },
  { id: "wildwood_animal_clinic_portland", name: "Wildwood Animal Clinic (Portland)", cid: "1157025246" },
  { id: "360_pet_medical", name: "360 Pet Medical", cid: "3255501301" },
  { id: "above_and_beyond_animal_care", name: "Above and Beyond Animal Care", cid: "9770900709" },
  { id: "adobe_animal_hospital", name: "Adobe Animal Hospital", cid: "9550453649" },
  { id: "adobe_animal_hospital_of_soquel", name: "Adobe Animal Hospital of Soquel", cid: "7968571707" },
  { id: "alexandria_veterinary_clinic", name: "Alexandria Veterinary Clinic", cid: "3038894727" },
  { id: "all_creatures_animal_care_center", name: "All Creatures Animal Care Center", cid: "2073859662" },
  { id: "all_creatures_animal_hospital", name: "All Creatures Animal Hospital", cid: "6445201578" },
  { id: "allegheny_veterinary_associates", name: "Allegheny Veterinary Associates", cid: "7452927599" },
  { id: "alta_vista_animal_hospital", name: "Alta Vista Animal Hospital", cid: "2327546696" },
  { id: "altitude_animal_hospital", name: "Altitude Animal Hospital", cid: "6490230933" },
  { id: "animal_care_center_salem", name: "Animal Care Center (Salem)", cid: "8427045431" },
  { id: "animal_care_clinic", name: "Animal Care Clinic", cid: "4513310498" },
  { id: "animal_care_hospital", name: "Animal Care Hospital", cid: "5698548321" },
  { id: "animal", name: "Animal Clinic East", cid: "3146645588" },
  { id: "animal_dental_clinic", name: "Animal Dental Clinic", cid: "8233498631" },
  { id: "animal_healthcare_center", name: "Animal HealthCare Center", cid: "2886067143" },
  { id: "animal_hospital_of_east_davie", name: "Animal Hospital of East Davie", cid: "7297056296" },
  { id: "animal_medical_center_of_van_buren", name: "Animal Medical Center of Van Buren", cid: "6722835103" },
  { id: "animal_medical_service", name: "Animal Medical Service", cid: "3993871256" },
  { id: "animal_medical_and_surgical_hospital_tul", name: "Animal Medical and Surgical Hospital (Tulsa & Broken Arrow)", cid: "1622051292" },
  { id: "arbor_hills_animal_clinic", name: "Arbor Hills Animal Clinic", cid: "9809280378" },
  { id: "arlington_veterinary_center", name: "Arlington Veterinary Center", cid: "2406914721" },
  { id: "bailey_veterinary_clinic", name: "Bailey Veterinary Clinic", cid: "9980554442" },
  { id: "barker", name: "Barker Animal Hospital", cid: "2817604111" },
  { id: "bay_animal_hospital", name: "Bay Animal Hospital", cid: "2358626298" },
  { id: "bay_animal_hospital_mi", name: "Bay Animal Hospital (MI)", cid: "1459171396" },
  { id: "bayshore_animal_hospital", name: "Bayshore Animal Hospital", cid: "3579800991" },
  { id: "belle_city_veterinary_hospital", name: "Belle City Veterinary Hospital", cid: "7997792929" },
  { id: "belvoir_pet_hospital", name: "Belvoir Pet Hospital", cid: "5057386791" },
  { id: "bernalillo_pet_care_center", name: "Bernalillo Pet Care Center", cid: "6251349109" },
  { id: "best_friends_animal_clinic", name: "Best Friends Animal Clinic", cid: "9214123596" },
  { id: "best_friends_veterinary_center", name: "Best Friends Veterinary Center", cid: "4077600662" },
  { id: "bexley_animal_hospital", name: "Bexley Animal Hospital", cid: "2617844629" },
  { id: "boulevard_animal_hospital", name: "Boulevard Animal Hospital", cid: "3909665058" },
  { id: "brooklyn_road_veterinary_clinic", name: "Brooklyn Road Veterinary Clinic", cid: "9320579195" },
  { id: "brown_animal_hospital", name: "Brown Animal Hospital", cid: "7890596841" },
  { id: "burlingame_family_pet_hospital", name: "Burlingame Family Pet Hospital", cid: "7696354846" },
  { id: "canyons_veterinary_clinic", name: "Canyons Veterinary Clinic", cid: "5297208154" },
  { id: "carr_veterinary_hospital", name: "Carr Veterinary Hospital", cid: "6720964851" },
  { id: "carver_lake_veterinary_center", name: "Carver Lake Veterinary Center", cid: "1817774570" },
  { id: "cascade_animal_clinic", name: "Cascade Animal Clinic", cid: "6938616188" },
  { id: "cat_care_professionals", name: "Cat Care Professionals", cid: "8428630694" },
  { id: "cats_dogs_animal_hospital", name: "Cats & Dogs Animal Hospital", cid: "8826834648" },
  { id: "chalco_hills_animal_hospital", name: "Chalco Hills Animal Hospital", cid: "5394715507" },
  { id: "chelsea_animal_hospital", name: "Chelsea Animal Hospital", cid: "1255277178" },
  { id: "cherry_grove_animal_hospital", name: "Cherry Grove Animal Hospital", cid: "4246778788" },
  { id: "cherry_valley_veterinary_hospital", name: "Cherry Valley Veterinary Hospital", cid: "8749342700" },
  { id: "chico", name: "Chico Creek Animal Hospital", cid: "6095765303" },
  { id: "churchland_animal_clinic", name: "Churchland Animal Clinic", cid: "5271941713" },
  { id: "cicero_animal_clinic", name: "Cicero Animal Clinic", cid: "7546608449" },
  { id: "clear_creek_animal_hospital", name: "Clear Creek Animal Hospital", cid: "2697788721" },
  { id: "cobblestone_veterinary_care", name: "Cobblestone Veterinary Care", cid: "2709584893" },
  { id: "cocoa_veterinary_hospital", name: "Cocoa Veterinary Hospital", cid: "8212256145" },
  { id: "cohutta_animal_clinic", name: "Cohutta Animal Clinic", cid: "3531508586" },
  { id: "college_hills_veterinary_hospital", name: "College Hills Veterinary Hospital", cid: "5808783846" },
  { id: "companion_animal_hospital_ca", name: "Companion Animal Hospital (CA)", cid: "7386432280" },
  { id: "companion_animal_veterinary_hospital", name: "Companion Animal Veterinary Hospital", cid: "3179786700" },
  { id: "compass_veterinary_clinic", name: "Compass Veterinary Clinic", cid: "8037923984" },
  { id: "compassionate_care_animal_hospital", name: "Compassionate Care Animal Hospital", cid: "9288893695" },
  { id: "creekside_animal_hospital", name: "Creekside Animal Hospital", cid: "2106402848" },
  { id: "cross_lanes_veterinary_hospital", name: "Cross Lanes Veterinary Hospital", cid: "5346794966" },
  { id: "cross_veterinary_clinic", name: "Cross Veterinary Clinic", cid: "4755753900" },
  { id: "crossroad_animal_hospital_ga", name: "Crossroad Animal Hospital (GA)", cid: "7315465249" },
  { id: "crossroads_animal_hospital", name: "Crossroads Animal Hospital", cid: "3943428539" },
  { id: "dandridge_animal_hospital", name: "Dandridge Animal Hospital", cid: "1381647296" },
  { id: "del_norte_animal_clinic", name: "Del Norte Animal Clinic", cid: "6275283611" },
  { id: "desert_tails_animal_clinic", name: "Desert Tails Animal Clinic", cid: "9018425231" },
  { id: "doc_holly_pet_vet", name: "Doc Holly Pet Vet", cid: "2774648550" },
  { id: "eastown_veterinary_clinic", name: "Eastown Veterinary Clinic", cid: "5028501364" },
  { id: "echo_hollow_veterinary_hospital_urgent_c", name: "Echo Hollow Veterinary Hospital  & Urgent Care", cid: "5150847272" },
  { id: "edmonds_westgate_veterinary_hospital", name: "Edmonds-Westgate Veterinary Hospital", cid: "6829342309" },
  { id: "elm_creek_animal_hospital", name: "Elm Creek Animal Hospital", cid: "2596572915" },
  { id: "fma_animal_hospital", name: "FMA Animal Hospital", cid: "6837732215" },
  { id: "fairgrounds_animal_hospital", name: "Fairgrounds Animal Hospital", cid: "7073945813" },
  { id: "family_pet_clinic_of_newberg", name: "Family Pet Clinic of Newberg", cid: "4102417298" },
  { id: "festival_animal_clinic", name: "Festival Animal Clinic", cid: "8440791849" },
  { id: "foland_veterinary_services", name: "Foland Veterinary Services", cid: "6556327839" },
  { id: "foothill_farms_veterinary_hospital", name: "Foothill Farms Veterinary Hospital", cid: "7258131341" },
  { id: "for_paws_veterinary_clinic", name: "For Paws Veterinary Clinic", cid: "6623665601" },
  { id: "forest_valley_veterinary_clinic", name: "Forest Valley Veterinary Clinic", cid: "6815930801" },
  { id: "four_paws_four_points_veterinary_hospita", name: "Four Paws @ Four Points Veterinary Hospital", cid: "7380899452" },
  { id: "four_paws_pet_hotel_resort", name: "Four Paws Pet Hotel & Resort", cid: "1131914815" },
  { id: "frey_pet_hospital", name: "Frey Pet Hospital", cid: "6551261823" },
  { id: "friarsgate_ballentine_animal_hospital", name: "Friarsgate-Ballentine Animal Hospital", cid: "2053605746" },
  { id: "friendtown_veterinary_clinic", name: "Friendtown Veterinary Clinic", cid: "8644313735" },
  { id: "frontier_veterinary_care", name: "Frontier Veterinary Care", cid: "8364820482" },
  { id: "georgetown_veterinary_clinic", name: "Georgetown Veterinary Clinic", cid: "6711636697" },
  { id: "grant_creek_veterinary_services", name: "Grant Creek Veterinary Services", cid: "6975614527" },
  { id: "greenbrier_animal_care_center", name: "Greenbrier Animal Care Center", cid: "8000637848" },
  { id: "griffin_animal_care", name: "Griffin Animal Care", cid: "3909609046" },
  { id: "guthrie_pet_hospital", name: "Guthrie Pet Hospital", cid: "9599303764" },
  { id: "healing_arts_veterinary_center", name: "Healing Arts Veterinary Center", cid: "2506751103" },
  { id: "incline_veterinary_hospital", name: "Incline Veterinary Hospital", cid: "3762476313" },
  { id: "inman_animal_hospital", name: "Inman Animal Hospital", cid: "7071701684" },
  { id: "intown_animal_hospital", name: "Intown Animal Hospital", cid: "5015889541" },
  { id: "intown_animal_hospital_midtown", name: "Intown Animal Hospital - Midtown", cid: "4157631295" },
  { id: "jamacha_pet_vets", name: "Jamacha Pet Vets", cid: "4531754052" },
  { id: "justin_animal_hospital", name: "Justin Animal Hospital", cid: "2818086939" },
  { id: "kehoe_animal_clinic_of_viera", name: "Kehoe Animal Clinic of Viera", cid: "7786568603" },
  { id: "kyle_animal_hospital", name: "Kyle Animal Hospital", cid: "2938094603" },
  { id: "lago_vista_animal_clinic", name: "Lago Vista Animal Clinic", cid: "8000529956" },
  { id: "lansdowne_animal_hospital", name: "Lansdowne Animal Hospital", cid: "5927992390" },
  { id: "laurel_road_veterinary_clinic", name: "Laurel Road Veterinary Clinic", cid: "9885921529" },
  { id: "legacy_animal_hospital", name: "Legacy Animal Hospital", cid: "9357769145" },
  { id: "lifelong_pet_health_care", name: "Lifelong Pet Health Care", cid: "4353666793" },
  { id: "little_critters_veterinary_hospital", name: "Little Critters Veterinary Hospital", cid: "1995947044" },
  { id: "littleton_west_animal_hospital", name: "Littleton West Animal Hospital", cid: "6424860346" },
  { id: "lower_columbia_veterinary_clinic", name: "Lower Columbia Veterinary Clinic", cid: "7460484942" },
  { id: "mac_animal_hospital", name: "MAC Animal Hospital", cid: "3419734015" },
  { id: "magic_valley_veterinary_hospital", name: "Magic Valley Veterinary Hospital", cid: "5690694391" },
  { id: "main_street_animal_clinic", name: "Main Street Animal Clinic", cid: "3643400094" },
  { id: "malaherd_veterinary_hospital", name: "Malaherd Veterinary Hospital", cid: "5752891678" },
  { id: "meadowbrook_breckenridge_veterinary_clin", name: "Meadowbrook & Breckenridge Veterinary Clinic", cid: "8181759086" },
  { id: "meadowbrook_veterinary_clinic", name: "Meadowbrook Veterinary Clinic", cid: "1198808700" },
  { id: "meadowbrook_veterinary_clinic", name: "Meadowbrook Veterinary Clinic", cid: "4521912321" },
  { id: "mebane_veterinary_hospital", name: "Mebane Veterinary Hospital", cid: "6494297723" },
  { id: "medford_animal_hospital", name: "Medford Animal Hospital", cid: "5708678772" },
  { id: "midway_vets", name: "Midway Vets", cid: "4805975825" },
  { id: "mission", name: "Mission Valley Veterinary Clinic", cid: "7230081941" },
  { id: "monument_view_veterinary_hospital", name: "Monument View Veterinary Hospital", cid: "8253783356" },
  { id: "moreland_veterinary_hospital", name: "Moreland Veterinary Hospital", cid: "9991736394" },
  { id: "morgan_pet_clinic", name: "Morgan Pet Clinic", cid: "7977550852" },
  { id: "mountain_view_animal_hospital", name: "Mountain View Animal Hospital", cid: "7639033192" },
  { id: "mukilteo", name: "Mukilteo Veterinary Hospital", cid: "6224647299" },
  { id: "newark_veterinary_hospital", name: "Newark Veterinary Hospital", cid: "4000769901" },
  { id: "north_hills_animal_hospital", name: "North Hills Animal Hospital", cid: "6151744097" },
  { id: "north_hills_animal_hospital_resort", name: "North Hills Animal Hospital & Resort", cid: "7096860168" },
  { id: "north_ranch_animal_hospital", name: "North Ranch Animal Hospital", cid: "1868607931" },
  { id: "north_suffolk_animal_clinic", name: "North Suffolk Animal Clinic", cid: "8442856768" },
  { id: "northbrook_animal_hospital", name: "Northbrook Animal Hospital", cid: "7632869741" },
  { id: "northpointe_animal_hospital", name: "Northpointe Animal Hospital", cid: "5838613272" },
  { id: "oakwood_veterinary_hospital", name: "Oakwood Veterinary Hospital", cid: "8240486248" },
  { id: "oconomowoc_animal_hospital", name: "Oconomowoc Animal Hospital", cid: "9636690691" },
  { id: "ohana_pet_hospital", name: "Ohana Pet Hospital", cid: "4178354539" },
  { id: "ohio_drive_animal_hospital", name: "Ohio Drive Animal Hospital", cid: "5200895295" },
  { id: "orchards_veterinary_clinic", name: "Orchards Veterinary Clinic", cid: "9057853382" },
  { id: "pacific_animal_hospital", name: "Pacific Animal Hospital", cid: "3235809925" },
  { id: "parkview_cat_clinic", name: "Parkview Cat Clinic", cid: "9454397058" },
  { id: "parkway_animal_hospital", name: "Parkway Animal Hospital", cid: "5039276701" },
  { id: "parvin_animal_clinic", name: "Parvin Animal Clinic", cid: "2569010545" },
  { id: "paws_claws_pet_medical_center", name: "Paws & Claws Pet Medical Center", cid: "5143998846" },
  { id: "paws_claws_and_hooves_veterinary_center", name: "Paws Claws and Hooves Veterinary Center", cid: "5255841333" },
  { id: "paws_and_claws_animal_hospital", name: "Paws and Claws Animal Hospital", cid: "7401356898" },
  { id: "peninsula_dog_cat_clinic", name: "Peninsula Dog & Cat Clinic", cid: "8173040864" },
  { id: "perimeter_veterinary_center", name: "Perimeter Veterinary Center", cid: "3838779090" },
  { id: "pet_medical_center_of_boca_raton", name: "Pet Medical Center of Boca Raton", cid: "2670908552" },
  { id: "pet_vet_hospital_and_wellness_center", name: "Pet Vet Hospital and Wellness Center", cid: "9899542005" },
  { id: "petsvet_animal_hospital", name: "PetsVet Animal Hospital", cid: "2735539893" },
  { id: "pine_castle_animal_care_center", name: "Pine Castle Animal Care Center", cid: "8624010258" },
  { id: "pine_forest_animal_clinic", name: "Pine Forest Animal Clinic", cid: "8975948921" },
  { id: "pine_woods_animal_hospital", name: "Pine Woods Animal Hospital", cid: "8074247121" },
  { id: "pioneer_animal_hospital", name: "Pioneer Animal Hospital", cid: "8880013519" },
  { id: "port_st_john_veterinary_hospital", name: "Port St. John Veterinary Hospital", cid: "2729578276" },
  { id: "poulsbo_animal_clinic", name: "Poulsbo Animal Clinic", cid: "5034059878" },
  { id: "progressive_animal_wellness", name: "Progressive Animal Wellness", cid: "9444139390" },
  { id: "pulaski_veterinary_clinic", name: "Pulaski Veterinary Clinic", cid: "4410920276" },
  { id: "purrfurably_cats_veterinary_hospital", name: "Purrfurably Cats Veterinary Hospital", cid: "7199657898" },
  { id: "richmond_avenue_animal_hospital", name: "Richmond Avenue Animal Hospital", cid: "5398397774" },
  { id: "risinger_veterinary_hospital", name: "Risinger Veterinary Hospital", cid: "8912411313" },
  { id: "river_run_animal_hospital", name: "River Run Animal Hospital", cid: "8619667442" },
  { id: "river_valley_vet", name: "River Valley Vet", cid: "9768078644" },
  { id: "riverwalk_animal_hospital", name: "Riverwalk Animal Hospital", cid: "3654124309" },
  { id: "russell_creek_pet_clinic_and_hospital", name: "Russell Creek Pet Clinic and Hospital", cid: "4765072972" },
  { id: "salazar_road_veterinary_clinic", name: "Salazar Road Veterinary Clinic", cid: "5026212849" },
  { id: "san_marin_animal_hospital", name: "San Marin Animal Hospital", cid: "2337045013" },
  { id: "santa_monica_veterinary_group", name: "Santa Monica Veterinary Group", cid: "7582147764" },
  { id: "sheridan_animal_hospital", name: "Sheridan Animal Hospital", cid: "3851301233" },
  { id: "shoreline_veterinary_hospital", name: "Shoreline Veterinary Hospital", cid: "7852845394" },
  { id: "sooner_veterinary_hospital", name: "Sooner Veterinary Hospital", cid: "4514692041" },
  { id: "south_shores_animal_hospital", name: "South Shores Animal Hospital", cid: "4488488542" },
  { id: "south_shores_pet_clinic", name: "South Shores Pet Clinic", cid: "5552518699" },
  { id: "south_shreveport_animal_hospital", name: "South Shreveport Animal Hospital", cid: "6793452964" },
  { id: "southeast_community_animal_hospital", name: "Southeast Community Animal Hospital", cid: "8018688354" },
  { id: "spring_valley_veterinary_hospital_west_e", name: "Spring Valley Veterinary Hospital West/East", cid: "6636108217" },
  { id: "staples_mill_animal_hospital", name: "Staples Mill Animal Hospital", cid: "9522252854" },
  { id: "startz_veterinary", name: "Startz Veterinary", cid: "2681310839" },
  { id: "stateline_animal_clinic", name: "Stateline Animal Clinic", cid: "8089512792" },
  { id: "sunset_animal_clinic", name: "Sunset Animal Clinic", cid: "3349629660" },
  { id: "tender_care_animal_hospital", name: "Tender Care Animal Hospital", cid: "9756395805" },
  { id: "tender_care_animal_hospital_of_peoria", name: "Tender Care Animal Hospital of Peoria", cid: "5736814025" },
  { id: "terrace_heights_family_pet_clinic", name: "Terrace Heights Family Pet Clinic", cid: "4895952294" },
  { id: "the_pet_wellness_clinic", name: "The Pet Wellness Clinic", cid: "6112436127" },
  { id: "the_veterinary_hospital", name: "The Veterinary Hospital", cid: "7086141456" },
  { id: "the_whole_pet_vet_hospital_and_wellness_", name: "The Whole Pet Vet Hospital and Wellness Center", cid: "7222994694" },
  { id: "tiger_tails_animal_hospital", name: "Tiger Tails Animal Hospital", cid: "9638845848" },
  { id: "tualatin_animal_clinic", name: "Tualatin Animal Clinic", cid: "9396977600" },
  { id: "university_animal_hospital", name: "University Animal Hospital", cid: "3152947715" },
  { id: "unleashed_at_carters_creek", name: "Unleashed at Carters Creek", cid: "8952735443" },
  { id: "vetcare", name: "Vetcare", cid: "5362237931" },
  { id: "village_crossroad_animal_hospital", name: "Village Crossroad Animal Hospital", cid: "4907737300" },
  { id: "village_square_portola_valley_veterinary", name: "Village Square Portola Valley Veterinary Clinic", cid: "5992179929" },
  { id: "village_square_woodside_veterinary_hospi", name: "Village Square Woodside Veterinary Hospital", cid: "6426804449" },
  { id: "village_veterinary_clinic", name: "Village Veterinary Clinic", cid: "4712772868" },
  { id: "vista_vet_animal_hospital_pet_lodge", name: "Vista Vet Animal Hospital & Pet Lodge", cid: "6759761846" },
  { id: "vogel_veterinary_hospital", name: "Vogel Veterinary Hospital", cid: "7166202205" },
  { id: "waccamaw_regional_veterinary_center", name: "Waccamaw Regional Veterinary Center", cid: "2527565300" },
  { id: "wellspring_animal_hospital", name: "Wellspring Animal Hospital", cid: "7114245750" },
  { id: "west_side_animal_clinic", name: "West Side Animal Clinic", cid: "5560679954" },
  { id: "wheelersburg_animal_hospital", name: "Wheelersburg Animal Hospital", cid: "2418049468" },
  { id: "wimberley_veterinary_clinic", name: "Wimberley Veterinary Clinic", cid: "3745351429" },
  { id: "woodinville_animal_hospital", name: "Woodinville Animal Hospital", cid: "9143402395" },
  { id: "worthington_woods_animal_care_center", name: "Worthington Woods Animal Care Center", cid: "7731120507" },];

// Validated conversion action names (exact match — never change these)
const VALIDATED_ACTIONS = [
  'New Client (Industry) (call extensions)',
  'New Client (Industry) (web page calls)',
  'Appointment Booked (Conversion) (call extensions)',
  'Appointment Booked (Conversion) (web page calls)',
];

// NC Appt — shown for reference only, negative correlation with matchback (never include in signal)
const NCA_ACTIONS = [
  'New Client Appointment (call extensions)',
  'New Client Appointment (web page calls)',
];

// Month window auto-generates from START_DATE → today.
// Keys are unique within a fiscal year (Oct–Sep). No manual update needed.
const START_DATE = '2025-10-01';
const _MO_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
function buildMonthKeys(startStr) {
  const keys = {};
  const now = new Date();
  const [sy, sm] = startStr.slice(0,7).split('-').map(Number);
  let d = new Date(sy, sm - 1, 1);
  while (d <= now) {
    const yyyy = d.getFullYear(), mo = d.getMonth();
    keys[`${yyyy}-${String(mo+1).padStart(2,'0')}-01`] = _MO_SHORT[mo];
    d = new Date(yyyy, mo + 1, 1);
  }
  return keys;
}
const MONTH_KEYS = buildMonthKeys(START_DATE);

function today() { return new Date().toISOString().slice(0, 10); }

// ── Google Ads client ─────────────────────────────────────────────────────────
const client = new GoogleAdsApi({
  client_id:       process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret:   process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

function getCustomer(cid) {
  return client.Customer({
    customer_id:       cid,
    login_customer_id: MCC_ID,
    refresh_token:     process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });
}

// ── Aggregate rows ────────────────────────────────────────────────────────────
function aggregateTraffic(rows) {
  const spend = {}, imp = {}, clicks = {};
  for (const mk of Object.values(MONTH_KEYS)) { spend[mk]=0; imp[mk]=0; clicks[mk]=0; }
  for (const row of rows) {
    const mk = MONTH_KEYS[row.segments.month];
    if (!mk) continue;
    spend[mk]  += Math.round((row.metrics.cost_micros || 0) / 1_000_000);
    imp[mk]    += row.metrics.impressions || 0;
    clicks[mk] += row.metrics.clicks      || 0;
  }
  return { spend, imp, clicks };
}

function aggregateConversions(rows) {
  const sig = {}, convByAction = {}, nca = {};
  for (const mk of Object.values(MONTH_KEYS)) {
    sig[mk] = 0;
    convByAction[mk] = { appt_call:0, appt_web:0, nci_call:0, nci_web:0, nca_call:0, nca_web:0 };
    nca[mk] = 0;
  }
  for (const row of rows) {
    const mk  = MONTH_KEYS[row.segments.month];
    if (!mk) continue;
    const name = row.segments.conversion_action_name;
    const val  = Math.round(row.metrics.all_conversions || 0);
    if (name === 'Appointment Booked (Conversion) (call extensions)') { convByAction[mk].appt_call += val; sig[mk] += val; }
    if (name === 'Appointment Booked (Conversion) (web page calls)')  { convByAction[mk].appt_web  += val; sig[mk] += val; }
    if (name === 'New Client (Industry) (call extensions)')           { convByAction[mk].nci_call  += val; sig[mk] += val; }
    if (name === 'New Client (Industry) (web page calls)')            { convByAction[mk].nci_web   += val; sig[mk] += val; }
    if (name === 'New Client Appointment (call extensions)')          { convByAction[mk].nca_call  += val; nca[mk] += val; }
    if (name === 'New Client Appointment (web page calls)')           { convByAction[mk].nca_web   += val; nca[mk] += val; }
  }
  return { sig, convByAction, nca };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const jsonPath = path.join(__dirname, 'data.json');
  const existing = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    : { accounts: [], weekly: [], monthly: [] };
  const existingMap = Object.fromEntries((existing.accounts || []).map(a => [a.id, a]));

  const dateTo = today();
  const actionList = [...VALIDATED_ACTIONS, ...NCA_ACTIONS].map(a => `'${a}'`).join(', ');

  const trafficQuery = `
    SELECT segments.month, metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${START_DATE}' AND '${dateTo}'
    ORDER BY segments.month`;

  const convQuery = `
    SELECT segments.month, segments.conversion_action_name, metrics.all_conversions
    FROM campaign
    WHERE segments.date BETWEEN '${START_DATE}' AND '${dateTo}'
    AND segments.conversion_action_name IN (${actionList})
    ORDER BY segments.month`;

  console.log(`Fetching ${ACCOUNTS.length} accounts (${START_DATE} → ${dateTo})...`);

  const updatedAccounts = [];

  // Process in batches of 10 to avoid rate limits
  const BATCH = 10;
  for (let i = 0; i < ACCOUNTS.length; i += BATCH) {
    const batch = ACCOUNTS.slice(i, i + BATCH);
    await Promise.all(batch.map(async acct => {
      try {
        const customer = getCustomer(acct.cid);
        const [trafficRows, convRows] = await Promise.all([
          customer.query(trafficQuery),
          customer.query(convQuery),
        ]);
        const { spend, imp, clicks }  = aggregateTraffic(trafficRows);
        const { sig, convByAction, nca } = aggregateConversions(convRows);
        const prev = existingMap[acct.id] || {};
        const mb   = prev.mb || {};
        const cpm  = {};
        for (const mk of Object.values(MONTH_KEYS)) {
          cpm[mk] = (mb[mk] && mb[mk] > 0)
            ? Math.round(spend[mk] / mb[mk])
            : (prev.cpm?.[mk] || 0);
        }
        updatedAccounts.push({
          id: acct.id, name: acct.name, cid: acct.cid,
          ct: acct.ct || prev.ct || 'pmax_std',
          spend, imp, clicks, sig, mb, cpm, convByAction, nca,
          mb_inv: prev.mb_inv, mb_vet: prev.mb_vet, nc: prev.nc,
          bestR:  prev.bestR  ?? 0,
          bestCR: prev.bestCR ?? 0,
          bestA:  prev.bestA  ?? '',
          recSet: prev.recSet ?? '',
          strong: prev.strong ?? 0,
          neg:    prev.neg    ?? 0,
          floor:  prev.floor  ?? 450,
          budget: prev.budget ?? 450,
          tier:   prev.tier   ?? 'Floor',
          sigs:   prev.sigs   ?? [],
        });
        process.stdout.write('.');
      } catch (err) {
        process.stdout.write('x');
        if (existingMap[acct.id]) updatedAccounts.push(existingMap[acct.id]);
        else updatedAccounts.push({ id: acct.id, name: acct.name, cid: acct.cid, ct: 'pmax_std',
          spend:{}, imp:{}, clicks:{}, sig:{}, mb:{}, cpm:{}, convByAction:{},
          bestR:0, bestCR:0, bestA:'', recSet:'', strong:0, neg:0, floor:450, budget:450, tier:'Floor', sigs:[] });
      }
    }));
    console.log(` ${Math.min(i+BATCH, ACCOUNTS.length)}/${ACCOUNTS.length}`);
  }

  // Rebuild monthly totals
  const monthly = (existing.monthly || []).map(m => {
    const mk = m.month;
    return {
      ...m,
      spend:  updatedAccounts.reduce((s, a) => s + (a.spend[mk]  || 0), 0),
      imp:    updatedAccounts.reduce((s, a) => s + (a.imp[mk]    || 0), 0),
      clicks: updatedAccounts.reduce((s, a) => s + (a.clicks[mk] || 0), 0),
      sig:    updatedAccounts.reduce((s, a) => s + (a.sig[mk]    || 0), 0),
    };
  });

  const output = {
    _updated: dateTo,
    _note: 'spend/imp/clicks/sig/convByAction from Google Ads API. mb from matchback (Invoca+Vetstoria, 4-6wk lag). cpm = spend/mb.',
    accounts: updatedAccounts,
    weekly:   existing.weekly || [],
    monthly,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log(`\nDone. Wrote ${updatedAccounts.length} accounts to data.json`);
})();
