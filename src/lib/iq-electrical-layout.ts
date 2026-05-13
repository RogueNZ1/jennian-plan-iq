export type RoomType =
  | "bedroom" | "master_bedroom" | "bathroom" | "ensuite"
  | "kitchen" | "living" | "dining" | "laundry" | "garage"
  | "alfresco" | "hallway" | "study" | "other";

export type RoomSpec = {
  name: string;
  type: RoomType;
  area_m2: number;
};

export type ElectricalItem = {
  code: string;
  description: string;
  quantity: number;
  room?: string;
};

export type ElectricalSchedule = {
  items: ElectricalItem[];
  rooms: RoomSpec[];
  generatedAt: string;
};

function downlightsForRoom(room: RoomSpec): number {
  if (room.type === "bathroom" || room.type === "ensuite") return Math.max(2, Math.ceil(room.area_m2 / 3));
  if (room.type === "laundry") return Math.max(1, Math.ceil(room.area_m2 / 4));
  if (room.type === "garage") return Math.max(2, Math.ceil(room.area_m2 / 5));
  if (room.type === "hallway") return Math.max(1, Math.ceil(room.area_m2 / 4));
  return Math.max(2, Math.ceil(room.area_m2 / 3.5));
}

export function generateElectricalSchedule(rooms: RoomSpec[]): ElectricalSchedule {
  const items: ElectricalItem[] = [];

  for (const room of rooms) {
    const label = room.name;

    // Downlights
    items.push({ code: "DL", description: "LED Downlight", quantity: downlightsForRoom(room), room: label });

    // Switches
    const switches = room.area_m2 > 20 ? 2 : 1;
    items.push({ code: "SW", description: "Light Switch", quantity: switches, room: label });

    if (room.type === "bedroom" || room.type === "master_bedroom") {
      items.push({ code: "2002", description: "Double GPO", quantity: 3, room: label });
    } else if (room.type === "living" || room.type === "dining") {
      items.push({ code: "2002", description: "Double GPO", quantity: 4, room: label });
      items.push({ code: "2134", description: "Double GPO (Entertainment)", quantity: 1, room: label });
      items.push({ code: "7430", description: "TV Outlet (CAT6 + Coax)", quantity: 1, room: label });
    } else if (room.type === "study") {
      items.push({ code: "2002", description: "Double GPO", quantity: 2, room: label });
      items.push({ code: "5731", description: "CAT6 Data Outlet", quantity: 2, room: label });
    } else if (room.type === "alfresco" || room.type === "hallway" || room.type === "other") {
      items.push({ code: "2002", description: "Double GPO", quantity: 1, room: label });
    }

    if (room.type === "kitchen") {
      items.push({ code: "2002", description: "Double GPO (Bench)", quantity: 4, room: label });
      items.push({ code: "2010", description: "Fridge Outlet (Dedicated 10A)", quantity: 1, room: label });
      items.push({ code: "2012", description: "Dishwasher Outlet (Dedicated)", quantity: 1, room: label });
      items.push({ code: "2016", description: "Microwave Outlet (Dedicated)", quantity: 1, room: label });
      items.push({ code: "2018", description: "Rangehood Outlet (Dedicated)", quantity: 1, room: label });
      items.push({ code: "2026", description: "Oven Outlet (20A Dedicated)", quantity: 1, room: label });
      items.push({ code: "2032", description: "Hob Outlet (32A Dedicated)", quantity: 1, room: label });
      items.push({ code: "5731", description: "CAT6 Data Outlet", quantity: 1, room: label });
    }

    if (room.type === "laundry") {
      items.push({ code: "2002", description: "Double GPO", quantity: 1, room: label });
      items.push({ code: "2020", description: "Washing Machine Outlet (Dedicated)", quantity: 1, room: label });
      items.push({ code: "2022", description: "Dryer Outlet (Dedicated)", quantity: 1, room: label });
    }

    if (room.type === "bathroom" || room.type === "ensuite") {
      items.push({ code: "2250", description: "Heated Towel Rail Outlet", quantity: 1, room: label });
      items.push({ code: "2226", description: "Inline Exhaust Fan", quantity: 1, room: label });
    }

    if (room.type === "garage") {
      items.push({ code: "2002", description: "Double GPO", quantity: 2, room: label });
      items.push({ code: "2008", description: "Garage Auto Door Opener Outlet", quantity: 1, room: label });
      items.push({ code: "2150", description: "Weatherproof GPO (External)", quantity: 1, room: label });
    }
  }

  // CAT6 per bedroom
  for (const room of rooms) {
    if (room.type === "bedroom" || room.type === "master_bedroom") {
      items.push({ code: "5731", description: "CAT6 Data Outlet", quantity: 1, room: room.name });
    }
  }

  // Whole-house items
  items.push({ code: "2100", description: "Hot Water Unit Outlet (16A Dedicated)", quantity: 1 });
  items.push({ code: "6153VC", description: "Vynco Switchboard", quantity: 1 });
  items.push({ code: "2190D", description: "Smoke Detector (Interconnected)", quantity: Math.max(2, rooms.length) });
  items.push({ code: "6124.1", description: "Earthing Electrode", quantity: 1 });

  return { items, rooms, generatedAt: new Date().toISOString() };
}

export type RoomCounts = {
  masterBedrooms: number;
  bedrooms: number;
  bathrooms: number;
  ensuites: number;
  kitchen: number;
  living: number;
  dining: number;
  study: number;
  laundry: boolean;
  garage: boolean;
  alfresco: boolean;
  hallway: boolean;
};

export function buildRoomSpecsFromCounts(counts: RoomCounts): RoomSpec[] {
  const rooms: RoomSpec[] = [];
  for (let i = 0; i < counts.masterBedrooms; i++) {
    rooms.push({ name: i === 0 ? "Master Bedroom" : `Master Bedroom ${i + 1}`, type: "master_bedroom", area_m2: 18 });
  }
  for (let i = 0; i < counts.bedrooms; i++) {
    rooms.push({ name: `Bedroom ${i + 1}`, type: "bedroom", area_m2: 12 });
  }
  if (counts.kitchen > 0) rooms.push({ name: "Kitchen", type: "kitchen", area_m2: 15 });
  if (counts.living > 0) rooms.push({ name: "Living", type: "living", area_m2: 30 });
  if (counts.dining > 0) rooms.push({ name: "Dining", type: "dining", area_m2: 20 });
  for (let i = 0; i < counts.bathrooms; i++) {
    rooms.push({ name: i === 0 ? "Bathroom" : `Bathroom ${i + 1}`, type: "bathroom", area_m2: 8 });
  }
  for (let i = 0; i < counts.ensuites; i++) {
    rooms.push({ name: i === 0 ? "Ensuite" : `Ensuite ${i + 1}`, type: "ensuite", area_m2: 6 });
  }
  if (counts.laundry) rooms.push({ name: "Laundry", type: "laundry", area_m2: 6 });
  if (counts.garage) rooms.push({ name: "Garage", type: "garage", area_m2: 40 });
  if (counts.study > 0) rooms.push({ name: "Study", type: "study", area_m2: 10 });
  if (counts.alfresco) rooms.push({ name: "Alfresco", type: "alfresco", area_m2: 20 });
  if (counts.hallway) rooms.push({ name: "Hallway", type: "hallway", area_m2: 15 });
  return rooms;
}

export function electricalScheduleToCSV(schedule: ElectricalSchedule): string {
  const lines = ["Code,Description,Quantity,Room"];
  for (const item of schedule.items) {
    const room = item.room ?? "General";
    lines.push(`"${item.code}","${item.description}",${item.quantity},"${room}"`);
  }
  return lines.join("\n");
}
