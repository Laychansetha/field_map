Architecture and Database Logic
Before we continue developing the Traceability and Inspection System, I want to clarify the core workflow and make sure the database scheme is designed correctly for long-term growth. Please review the current architecture/schema against the following requirements before making major changes.
1. Traceability system
The public/general-user side is a true traceability interface. Clients should be able to search by Family Code and see the related farmer/plot information. When they click a plot, they should be able to see:
•	Plot size (ha) 
•	Estimated production (kg) 
•	Estimated sale to IRCC (kg) 
•	Actual rice sold to IRCC (kg), by variety 
Estimated production and estimated sales must come from the latest completed inspection data for that plot/subplot.
Actual sales will come separately from IRCC's paddy purchasing records. After the purchase season, Admin will upload an Excel file containing actual purchases. The system should match the purchase records to the correct farmer code/id and calculate/display actual quantities by variety, for example:
•	Phka Rumduol: 1,200 kg 
•	Local Variety: 2,000 kg 
•	Red Jasmine: 800 kg 
Please design an Admin function for uploading this Excel file, including validation and error checking. Please also provide the required Excel template/column structure so our team knows exactly how the file should be prepared.
2. Inspection / ICS system
The second major function is the internal inspection system. Inspectors log in and complete the ICS workflow:
Farmer → Parcel → Subplot → Harvest → post-harvest → Confirm
One farmer can have multiple parcels. One parcel can have multiple subplots when the farmer grows different varieties in the same parcel. Each subplot has its own variety, area and production/harvest information.
During the growing-season inspection, inspectors complete:
1.	Farmer 
2.	Parcel 
3.	Subplots 
5.	Confirm 
The inspector then verifies the information with the farmer, obtains the farmer's confirmation/signature, and saves the inspection.
Phase 2 – Harvest
From approximately October to January, the inspector returns to record the actual threshing/harvest information at subplot level and confirms it with the farmer.
Phase 3 – Post-Harvest
During the final/off-season inspection, the inspector completes:
•	4. Post-Harvest 
•	Final confirmation/reconfirmation 
At this point, the complete inspection record for that farmer/plot for that inspection year is stored as the final annual record.
3. Annual inspection and historical data
Every new inspection year must create a new annual inspection record without overwriting the previous year's data.
For example:
Farmer → Parcel → Subplot → 2025 Inspection
Farmer → Parcel → Subplot → 2026 Inspection
Farmer → Parcel → Subplot → 2027 Inspection
When a new season starts, existing farmers/plots should be available with relevant previous information as a starting reference, but the new year's data must be editable independently. Changing the 2026 record must never change the 2025 record.
Each year:
•	New farmers may join. 
•	Existing farmers may leave because of NC or resignation. 
•	Existing farmers may change status. 
•	New plots/polygons may be added. 
•	Existing plot boundaries may change. 
•	Some plots may be removed or no longer certified. 
We may therefore upload a new GeoJSON polygon dataset every year. The system must support this without breaking historical inspection records.
Please make sure the GIS polygon itself is not treated as the permanent identity of the inspection record. We need a stable relationship between Farmer → Parcel/Plot → Annual Inspection → Subplots, while allowing GIS boundaries to change between years.
4. Form structure must be flexible
The inspection forms will change over time. From year to year, we may add, remove, or modify questions in:
1.	Farmer 
2.	Parcel 
3.	Subplots 
4.	Post-Harvest 
5.	Confirm 
Please do not hard code the database so that adding or removing one question requires rebuilding the whole system.
The architecture should support versioned inspection forms/questions by inspection year or season, while preserving historical answers exactly as they were recorded.
5. Database design
Please review the database and make sure the structure follows the actual business relationship rather than simply copying the screen layout.
At minimum, the design should clearly separate:
Farmer
↓
Parcel/Plot
↓
Annual Inspection
↓
Subplot
↓
Harvest/Threshing
With Farmer-level, Parcel-level, Subplot-level, Post-Harvest and Confirmation records stored at the correct level.
The system should also support:
•	Annual GIS versions 
•	History inspection by year 
•	Farmer status changes 
•	Plot/parcel changes 
•	Subplot changes 
•	Actual IRCC purchase records 
•	Variety-level production and sales 
•	Traceability from farmer → plot → production → purchase 
•	Audit/history records so previous data is not accidentally overwritten 
6. Admin functions
Admin should be able to:
•	Upload the annual GeoJSON plot dataset. 
•	Upload actual IRCC purchase Excel data. 
•	Download/export data at any time, even when the inspection is still incomplete. The exports should include all data currently entered and clearly indicate which fields, phases, or records are still incomplete/blank. It should not require the farmer's inspection to be fully completed before downloading.
•	Download/export complete ICS data. 
•	Filter/export by year, site, village, farmer, plot or variety. 
•	Manage inspectors and user accounts. 
•	Manage inspection form/questions as requirements change. 
•	Review and correct data where authorized. 
Before continuing UI development, please audit the current database schema and application logic against this workflow and identify anything that should be changed now. I want to establish a strong database and architecture foundation first, because this system will continue growing every year and should not require major restructuring later.


