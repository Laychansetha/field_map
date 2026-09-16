import json
import math
import os
import sys

def sanitize_str(val):
    if val is None:
        return ""
    cleaned = str(val).replace("\r", "").replace("\n", "").strip()
    return cleaned

def polygon_area_m2(coordinates):
    R = 6378137.0 # Earth radius in meters
    total_area = 0.0

    for ring_idx, ring in enumerate(coordinates):
        if len(ring) < 3:
            continue
        area = 0.0
        for i in range(len(ring)):
            p1 = ring[i]
            p2 = ring[(i + 1) % len(ring)]
            lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
            lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
            area += (lon2 - lon1) * (2.0 + math.sin(lat1) + math.sin(lat2))
        ring_area = abs(area * (R ** 2) / 2.0)
        if ring_idx == 0:
            total_area += ring_area
        else:
            total_area -= ring_area
    return total_area

def multipolygon_area_m2(poly_coords):
    total = 0.0
    for poly in poly_coords:
        total += polygon_area_m2(poly)
    return total

def get_centroid_and_bbox(poly_coords):
    min_lon, min_lat = 180.0, 90.0
    max_lon, max_lat = -180.0, -90.0
    
    pts = []
    for poly in poly_coords:
        if poly and len(poly) > 0:
            outer = poly[0]
            for p in outer:
                lon, lat = p[0], p[1]
                pts.append((lon, lat))
                if lon < min_lon: min_lon = lon
                if lon > max_lon: max_lon = lon
                if lat < min_lat: min_lat = lat
                if lat > max_lat: max_lat = lat
                
    if not pts:
        return [0.0, 0.0], [0.0, 0.0, 0.0, 0.0]
        
    avg_lon = sum(p[0] for p in pts) / len(pts)
    avg_lat = sum(p[1] for p in pts) / len(pts)
    
    return [round(avg_lat, 6), round(avg_lon, 6)], [
        round(min_lat, 6), round(min_lon, 6), round(max_lat, 6), round(max_lon, 6)
    ]

def main():
    input_file = "all_ibis_rice_plots.geojson"
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found!")
        sys.exit(1)
        
    print(f"Reading {input_file}...")
    with open(input_file, "r", encoding="utf-8") as f:
        geojson_data = json.load(f)
        
    features = geojson_data.get("features", [])
    print(f"Loaded {len(features)} features.")
    
    optimized_features = []
    search_index = []
    hierarchy = {}
    
    total_area_all = 0.0
    
    for idx, feat in enumerate(features):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        
        raw_site = sanitize_str(props.get("site"))
        raw_village = sanitize_str(props.get("village"))
        raw_commune = sanitize_str(props.get("commune"))
        raw_family_id = sanitize_str(props.get("family_id"))
        raw_plot_id = sanitize_str(props.get("plot_id"))
        raw_year = sanitize_str(props.get("year_join"))
        
        site = raw_site if raw_site else "Unknown Site"
        village = raw_village if raw_village and raw_village not in ("#N/A", "N/A") else "Unknown Village"
        commune = raw_commune if raw_commune and raw_commune not in ("#N/A", "N/A") else ""
        family_id = raw_family_id if raw_family_id else f"Unknown_F{idx+1}"
        plot_id = raw_plot_id if raw_plot_id else f"P{idx+1}"
        year_join = raw_year if raw_year and raw_year != "0" else ""
        
        if geom.get("type") == "MultiPolygon":
            area_m2 = multipolygon_area_m2(coords)
            centroid, bbox = get_centroid_and_bbox(coords)
        elif geom.get("type") == "Polygon":
            area_m2 = polygon_area_m2(coords)
            centroid, bbox = get_centroid_and_bbox([coords])
        else:
            area_m2 = 0.0
            centroid, bbox = [0.0, 0.0], [0.0, 0.0, 0.0, 0.0]
            
        area_ha = round(area_m2 / 10000.0, 3)
        total_area_all += area_ha
        
        clean_props = {
            "id": idx,
            "site": site,
            "commune": commune,
            "village": village,
            "family_id": family_id,
            "plot_id": plot_id,
            "year_join": year_join,
            "area_ha": area_ha,
            "lat": centroid[0],
            "lng": centroid[1],
            "bbox": bbox
        }
        
        def round_coords(c):
            if isinstance(c[0], (int, float)):
                return [round(c[0], 6), round(c[1], 6)]
            return [round_coords(item) for item in c]
            
        rounded_geom = {
            "type": geom.get("type"),
            "coordinates": round_coords(coords)
        }
        
        optimized_features.append({
            "type": "Feature",
            "id": idx,
            "properties": clean_props,
            "geometry": rounded_geom
        })
        
        search_index.append({
            "id": idx,
            "site": site,
            "village": village,
            "commune": commune,
            "family_id": family_id,
            "plot_id": plot_id,
            "year_join": year_join,
            "area_ha": area_ha,
            "lat": centroid[0],
            "lng": centroid[1]
        })
        
        if site not in hierarchy:
            hierarchy[site] = {}
        if village not in hierarchy[site]:
            hierarchy[site][village] = {}
        if family_id not in hierarchy[site][village]:
            hierarchy[site][village][family_id] = []
            
        hierarchy[site][village][family_id].append({
            "id": idx,
            "plot_id": plot_id,
            "area_ha": area_ha,
            "lat": centroid[0],
            "lng": centroid[1]
        })
        
    out_geojson = {
        "type": "FeatureCollection",
        "features": optimized_features
    }
    
    out_geojson_path = os.path.join("public", "data", "plots.geojson")
    with open(out_geojson_path, "w", encoding="utf-8") as f:
        json.dump(out_geojson, f, separators=(",", ":"))
    print(f"Saved optimized GeoJSON: {out_geojson_path} ({os.path.getsize(out_geojson_path)/1024/1024:.2f} MB)")
    
    out_index_path = os.path.join("public", "data", "index.json")
    with open(out_index_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_plots": len(optimized_features),
            "total_area_ha": round(total_area_all, 1),
            "hierarchy": hierarchy,
            "plots": search_index
        }, f, separators=(",", ":"))
    print(f"Saved search index & hierarchy: {out_index_path} ({os.path.getsize(out_index_path)/1024/1024:.2f} MB)")
    print("Data preparation complete!")

if __name__ == "__main__":
    main()
