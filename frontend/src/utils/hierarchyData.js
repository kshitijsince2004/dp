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
        
        // Generate mock DCP details
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

// Helper to gather all PS nodes recursively under any given node
export function getStationsForNode(node) {
  if (node.type === "PS") return [node];
  let stations = [];
  if (node.children) {
    for (let child of node.children) {
      stations = [...stations, ...getStationsForNode(child)];
    }
  }
  return stations;
}

// Helper to compute deterministic mock stats for a single PS node
function getPSStats(psNode) {
  const seed = hashCode(psNode.stationName);
  return {
    firs: (seed % 25) + 8,
    arrests: (seed % 12) + 3,
    pcrCalls: (seed % 40) + 12,
    missingFound: (seed % 10) + 2,
    missingTotal: (seed % 12) + 4
  };
}

// Helper to compute dynamic, mathematically consistent metrics at any level
export function getMetricsForNode(id) {
  const node = findNodeById(id);
  if (!node) {
    return { firs: 0, arrests: 0, pcrCalls: 0, missingFound: 0, missingTotal: 0 };
  }
  
  const stations = getStationsForNode(node);
  const total = { firs: 0, arrests: 0, pcrCalls: 0, missingFound: 0, missingTotal: 0 };
  
  stations.forEach(ps => {
    const psStats = getPSStats(ps);
    total.firs += psStats.firs;
    total.arrests += psStats.arrests;
    total.pcrCalls += psStats.pcrCalls;
    total.missingFound += psStats.missingFound;
    total.missingTotal += psStats.missingTotal;
  });
  
  return total;
}

// Helper to generate a dynamic array of mock activity logs matching a node's scope
export function getMockLogsForNode(id) {
  const node = findNodeById(id);
  if (!node) return [];
  
  const stations = getStationsForNode(node);
  const stationNamesSet = new Set(stations.map(ps => ps.stationName));
  
  // Base list of mock logs
  const allLogs = [
    { 
      id: "FIR-220/2026", 
      type: "Case Entry", 
      time: "2026-06-14T10:30:00Z", 
      details: "Attempted robbery near Connaught Place", 
      status: "Active Investigation",
      badge: "warning",
      station: "Connaught Place",
      crimeHead: "Robbery"
    },
    { 
      id: "ARR-104/2026", 
      type: "Arrest Report", 
      time: "2026-06-14T09:15:00Z", 
      details: "NAFIS verified arrest of Ramesh Kumar Yadav", 
      status: "Approved",
      badge: "success",
      station: "Parliament Street",
      crimeHead: "Theft"
    },
    { 
      id: "PCR-442/2026", 
      type: "PCR Dispatch", 
      time: "2026-06-14T08:45:00Z", 
      details: "Traffic dispute handled near Civil Lines", 
      status: "Resolved",
      badge: "success",
      station: "Civil Lines",
      crimeHead: "Assault"
    },
    { 
      id: "UIDB-992/2026", 
      type: "UIDB Entry", 
      time: "2026-06-13T17:20:00Z", 
      details: "Unidentified male corpse recovered behind transformer", 
      status: "Autopsy Stage",
      badge: "info",
      station: "Parliament Street",
      crimeHead: "UIDB"
    },
    { 
      id: "MIS-30A/2026", 
      type: "Missing Child", 
      time: "2026-06-13T14:10:00Z", 
      details: "Aditya Verma (14 yrs) reported missing from Karol Bagh", 
      status: "Traced & Recovered",
      badge: "success",
      station: "Karol Bagh",
      crimeHead: "Kidnapping"
    },
    { 
      id: "FIR-231/2026", 
      type: "Case Entry", 
      time: "2026-06-13T11:20:00Z", 
      details: "Snatching of gold chain by bike-borne criminals", 
      status: "Active Search",
      badge: "warning",
      station: "Chankaya Puri",
      crimeHead: "Snatching"
    },
    { 
      id: "PCR-90A/2026", 
      type: "PCR Dispatch", 
      time: "2026-06-13T07:10:00Z", 
      details: "Domestic altercation reported, PCR dispatched", 
      status: "Resolved",
      badge: "success",
      station: "Ambedkar Nagar",
      crimeHead: "Assault"
    },
    { 
      id: "ARR-881/2026", 
      type: "Arrest Report", 
      time: "2026-06-12T23:30:00Z", 
      details: "Arrest of suspect in burglary case at market", 
      status: "Dossier Logged",
      badge: "success",
      station: "Hauz Khas",
      crimeHead: "Theft"
    },
    { 
      id: "MIS-101B/2026", 
      type: "Missing Child", 
      time: "2026-06-12T09:40:00Z", 
      details: "Young girl reported missing near Timarpur Metro", 
      status: "Active Search",
      badge: "warning",
      station: "TimarPur",
      crimeHead: "Kidnapping"
    },
    { 
      id: "UIDB-883/2026", 
      type: "UIDB Entry", 
      time: "2026-06-11T16:15:00Z", 
      details: "Unidentified body recovered near Ganda Nallah", 
      status: "Inquest Stage",
      badge: "info",
      station: "Bawana",
      crimeHead: "UIDB"
    }
  ];
  
  // Filter logs where the station belongs to the active node's child station list
  return allLogs.filter(log => stationNamesSet.has(log.station));
}

// Helper to recursively resolve and map database user properties to visual hierarchy tree nodes
export function findNodeByDbUser(user) {
  if (!user) return null;
  
  // 1. Map by station_id if present
  if (user.station_id) {
    const cleanDbPs = user.station_id.replace(/^PS_/, '').replace(/_/g, '').toUpperCase();
    const searchPs = (node = POLICE_HIERARCHY) => {
      if (node.type === "PS") {
        let name = node.stationName || "";
        name = name.replace(/^PS\s*:?\s*/i, '');
        const cleanNodePs = name.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (cleanDbPs === cleanNodePs) {
          return node;
        }
      }
      if (node.children) {
        for (let child of node.children) {
          const found = searchPs(child);
          if (found) return found;
        }
      }
      return null;
    };
    const foundPsNode = searchPs();
    if (foundPsNode) return foundPsNode;
  }

  // 2. Map by district_id if present
  if (user.district_id) {
    const dbDistCode = user.district_id.replace(/^(DISTRICT_|DIST_)/, '').toUpperCase();
    const searchDist = (node = POLICE_HIERARCHY) => {
      if (node.type === "DISTRICT" && (node.id === `DIST_${dbDistCode}` || node.id === dbDistCode)) {
        return node;
      }
      if (node.children) {
        for (let child of node.children) {
          const found = searchDist(child);
          if (found) return found;
        }
      }
      return null;
    };
    const foundDistNode = searchDist();
    if (foundDistNode) return foundDistNode;
  }

  // 3. Fallback to HQ
  return findNodeById("HQ");
}

