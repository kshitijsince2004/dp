import { DISTRICTS_AND_STATIONS } from "./policeData.js";

// Helper to generate a deterministic hash code for a string
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Maps District acronyms to full names in policeData.js
export const DISTRICT_MAP = {
  "SD": "South District (SD)",
  "SED": "South East District (SED)",
  "NDD": "New Delhi District (NDD)",
  "SWD": "South West District (SWD)",
  "WD": "West District (WD)",
  "OD": "Outer District (OD)",
  "DW": "Dwarka District (DW)",
  "NWD": "North West District (NWD)",
  "RND": "Rohini District (RND)",
  "OND": "Outer North District (OND)",
  "CD": "Central District (CD)",
  "ND": "North District (ND)",
  "ED": "East District (ED)",
  "NED": "North East District (NED)",
  "SHD": "Shahdara District (SHD)"
};

// Base static structure of Delhi Police command hierarchy
const BASE_HIERARCHY = {
  id: "HQ",
  name: "Delhi Police Headquarters",
  type: "HQ",
  officerName: "Dr. Vikram Singh, IPS",
  rank: "Director General of Police",
  pis: "PIS-28990142",
  children: [
    {
      id: "ZONE_2",
      name: "Spl. CP — L&O Zone 2",
      type: "ZONE",
      officerName: "Sh. Ranjit Prasad, IPS",
      rank: "Special Commissioner of Police",
      pis: "PIS-28821904",
      children: [
        {
          id: "RANGE_SOUTHERN",
          name: "Jt. CP — Southern Range",
          type: "RANGE",
          officerName: "Sh. Alok Kumar, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28751930",
          districts: ["SD", "SED"]
        },
        {
          id: "RANGE_NEW_DELHI",
          name: "Jt. CP — New Delhi Range",
          type: "RANGE",
          officerName: "Smt. Shalini Arora, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28789012",
          districts: ["NDD", "SWD"]
        },
        {
          id: "RANGE_WESTERN",
          name: "Jt. CP — Western Range",
          type: "RANGE",
          officerName: "Sh. Manoj Yadav, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28712903",
          districts: ["WD", "OD", "DW"]
        }
      ]
    },
    {
      id: "ZONE_1",
      name: "Spl. CP — L&O Zone 1",
      type: "ZONE",
      officerName: "Sh. Sanjay Sen, IPS",
      rank: "Special Commissioner of Police",
      pis: "PIS-28810294",
      children: [
        {
          id: "RANGE_NORTHERN",
          name: "Jt. CP — Northern Range",
          type: "RANGE",
          officerName: "Sh. Rajesh Dev, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28704921",
          districts: ["NWD", "RND", "OND"]
        },
        {
          id: "RANGE_CENTRAL",
          name: "Jt. CP — Central Range",
          type: "RANGE",
          officerName: "Smt. Meena Singh, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28749201",
          districts: ["CD", "ND"]
        },
        {
          id: "RANGE_EASTERN",
          name: "Jt. CP — Eastern Range",
          type: "RANGE",
          officerName: "Sh. H. S. Dhillon, IPS",
          rank: "Joint Commissioner of Police",
          pis: "PIS-28799042",
          districts: ["ED", "NED", "SHD"]
        }
      ]
    }
  ]
};

// Programmatically builds the full hierarchy tree dynamically
function buildHierarchy() {
  const root = { ...BASE_HIERARCHY };
  
  root.children = root.children.map(zone => {
    const updatedZone = { ...zone };
    updatedZone.children = zone.children.map(range => {
      const updatedRange = { ...range };
      
      // Map districts to Jt. CP Range
      updatedRange.children = range.districts.map(distCode => {
        const distFullName = DISTRICT_MAP[distCode];
        const distId = `DIST_${distCode}`;
        
        // Generate DCP officer details
        const hash = hashCode(distFullName);
        const dcpNames = ["A. K. Singh", "Harsha Vardhan", "Chinmoy Biswal", "Jitendra Mina", "Usha Rangnani", "Devesh Srivastava"];
        const dcpName = `Sh. ${dcpNames[hash % dcpNames.length]}, IPS`;
        
        const districtNode = {
          id: distId,
          name: distFullName,
          type: "DISTRICT",
          officerName: dcpName,
          rank: "Deputy Commissioner of Police",
          pis: `PIS-286${(hash % 90000) + 10000}`,
          districtKey: distFullName,
          children: []
        };
        
        // Map Police Stations under District
        const stations = DISTRICTS_AND_STATIONS[distFullName] || [];
        districtNode.children = stations.map(stationName => {
          const sHash = hashCode(stationName);
          const operatorNames = ["Ramesh Kumar", "Sanjay Sharma", "Amit Patel", "Sunil Dutt", "Rajender Prasad", "Vijay Negi"];
          const operatorName = `HC ${operatorNames[sHash % operatorNames.length]}`;
          
          return {
            id: `PS_${distCode}_${stationName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
            name: `PS: ${stationName}`,
            type: "PS",
            officerName: operatorName,
            rank: "Station Operator",
            pis: `PIS-285${(sHash % 90000) + 10000}`,
            districtKey: distFullName,
            stationName: stationName
          };
        });
        
        return districtNode;
      });
      
      delete updatedRange.districts; // clean temporary field
      return updatedRange;
    });
    return updatedZone;
  });
  
  return root;
}

export const POLICE_HIERARCHY = buildHierarchy();

// Helper to perform a Depth First Search on the tree
export function findNodeById(id, node = POLICE_HIERARCHY) {
  if (node.id === id) return node;
  if (node.children) {
    for (let child of node.children) {
      const found = findNodeById(id, child);
      if (found) return found;
    }
  }
  return null;
}

// Helper to trace path from root to node (for hierarchy path display)
export function getNodePath(id, node = POLICE_HIERARCHY, path = []) {
  if (node.id === id) return [...path, node];
  if (node.children) {
    for (let child of node.children) {
      const result = getNodePath(id, child, [...path, node]);
      if (result) return result;
    }
  }
  return null;
}
