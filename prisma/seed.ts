/**
 * LabVault seed v2 — run with: bun prisma/seed.ts
 *
 * IDEMPOTENT PER ENTITY: every entity is looked up by its natural key
 * (code / sku / email / certificate / title / purpose …). Re-running ADDS
 * missing data instead of skipping the whole run, and updates already-seeded
 * rows to their canonical v2 values. Legacy v1 rows (old statuses etc.) are
 * migrated to the v2 status sets.
 *
 * Inventory is LEDGER-CORRECT: every item's transaction history is generated
 * as a coherent chain (RECEIPT → ISSUE/RETURN/TRANSFER/ADJUSTMENT) whose
 * running balances end EXACTLY at the item's final quantity.
 */
import {
  PrismaClient,
  Chemical,
  MaintenanceRecord,
  CalibrationRecord,
  Reservation,
  Checkout,
  Vendor,
  PurchaseRequest,
  PurchaseOrder,
  Experiment,
  LabSession,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "Password@123";
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number, hour = 10, min = 0): Date {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
}
function daysAhead(days: number, hour = 10, min = 0): Date {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
}

type LabRow = { id: string; code: string; name: string };
type UserRow = { id: string; name: string; role: string };

async function ensureOrg() {
  const existing = await db.organization.findUnique({ where: { slug: "nova-labs" } });
  if (existing) {
    return db.organization.update({
      where: { id: existing.id },
      data: { name: "Northstar Institute of Technology", plan: "ENTERPRISE" },
    });
  }
  return db.organization.create({
    data: { name: "Northstar Institute of Technology", slug: "nova-labs", plan: "ENTERPRISE" },
  });
}

async function ensureDepartment(orgId: string, d: { name: string; code: string }) {
  const existing = await db.department.findFirst({
    where: { organizationId: orgId, code: d.code },
  });
  if (existing) {
    return db.department.update({ where: { id: existing.id }, data: { name: d.name } });
  }
  return db.department.create({ data: { organizationId: orgId, ...d } });
}

type UserSeed = {
  email: string;
  name: string;
  role: string;
  department: string;
  phone: string;
  passwordHash: string;
};

async function ensureOrgUser(orgId: string, u: UserSeed) {
  const existing = await db.user.findUnique({ where: { email: u.email } });
  const data = {
    name: u.name,
    role: u.role,
    department: u.department,
    phone: u.phone,
    status: "ACTIVE",
  };
  if (existing) return db.user.update({ where: { id: existing.id }, data });
  return db.user.create({
    data: { organizationId: orgId, email: u.email, passwordHash: u.passwordHash, ...data },
  });
}

async function ensureLab(
  orgId: string,
  l: {
    code: string;
    name: string;
    location: string;
    capacity: number;
    description: string;
    departmentId: string;
    managerId: string;
    status?: string;
  }
) {
  const existing = await db.lab.findFirst({ where: { organizationId: orgId, code: l.code } });
  const data = {
    name: l.name,
    location: l.location,
    capacity: l.capacity,
    description: l.description,
    departmentId: l.departmentId,
    managerId: l.managerId,
    status: l.status ?? "ACTIVE",
  };
  if (existing) return db.lab.update({ where: { id: existing.id }, data });
  return db.lab.create({ data: { organizationId: orgId, ...data, code: l.code } });
}

async function ensureCourse(
  orgId: string,
  c: { code: string; title: string; description: string; departmentId: string; instructorId: string }
) {
  const existing = await db.course.findFirst({ where: { organizationId: orgId, code: c.code } });
  const data = {
    title: c.title,
    description: c.description,
    departmentId: c.departmentId,
    instructorId: c.instructorId,
  };
  if (existing) return db.course.update({ where: { id: existing.id }, data });
  return db.course.create({ data: { organizationId: orgId, code: c.code, ...data } });
}

type EquipmentSeed = {
  lab: LabRow;
  name: string;
  code: string;
  category: string;
  status: string;
  condition: string;
  manufacturer: string;
  price: number;
};

async function ensureEquipment(orgId: string, adminId: string, e: EquipmentSeed, index: number) {
  const existing = await db.equipment.findFirst({
    where: { organizationId: orgId, code: e.code },
  });
  const purchaseDate = daysAgo(400 + ((index * 53) % 500), 12);
  const data = {
    name: e.name,
    labId: e.lab.id,
    category: e.category,
    status: e.status,
    condition: e.condition,
    manufacturer: e.manufacturer,
    price: e.price,
    serialNumber: `SN-${e.code}-${1000 + index * 7}`,
    purchaseDate,
    warrantyUntil: new Date(purchaseDate.getTime() + 730 * DAY),
  };
  const equipment = existing
    ? await db.equipment.update({ where: { id: existing.id }, data })
    : await db.equipment.create({ data: { organizationId: orgId, ...data, code: e.code } });

  // Events: CREATED always; STATUS_CHANGED history for non-available ones.
  const hasEvents = await db.equipmentEvent.count({ where: { equipmentId: equipment.id } });
  if (hasEvents === 0) {
    await db.equipmentEvent.create({
      data: {
        organizationId: orgId,
        equipmentId: equipment.id,
        type: "CREATED",
        newStatus: "AVAILABLE",
        notes: `Asset registered in ${e.lab.name}`,
        actorId: adminId,
        createdAt: purchaseDate,
      },
    });
    if (e.status !== "AVAILABLE") {
      const notesByStatus: Record<string, string> = {
        IN_USE: "Checked out for project work",
        UNDER_MAINTENANCE: "Taken up for maintenance",
        RETIRED: "End of life — withdrawn from service",
      };
      await db.equipmentEvent.create({
        data: {
          organizationId: orgId,
          equipmentId: equipment.id,
          type: "STATUS_CHANGED",
          previousStatus: "AVAILABLE",
          newStatus: e.status,
          notes: notesByStatus[e.status] ?? null,
          actorId: adminId,
          createdAt: daysAgo(2 + (index % 5) * 2, 15),
        },
      });
    }
  }
  return equipment;
}

// ---------------------------------------------------------------------------
// Inventory — ledger-correct history generator
// ---------------------------------------------------------------------------
type LedgerRow = {
  organizationId: string;
  itemId: string;
  type: string;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  transferToLabId: string | null;
  reason: string | null;
  performedById: string | null;
  createdAt: Date;
};

/**
 * Builds 2-4 coherent transactions ending EXACTLY at finalQty.
 * Order: RECEIPT, (TRANSFER), ISSUE*, RETURN/ADJUSTMENT — guarantees every
 * intermediate balance stays >= 0 and the last newBalance == finalQty.
 */
function buildLedgerChain(opts: {
  orgId: string;
  itemId: string;
  finalQty: number;
  minQuantity: number;
  index: number;
  transferToLabId: string | null;
  transferToLabName: string;
  actorIds: string[];
}): LedgerRow[] {
  const { orgId, itemId, finalQty: Q, minQuantity: m, index, actorIds } = opts;
  const out1 = Math.max(1, Math.floor(m * 0.6));
  const out2 = Math.max(1, Math.floor(m * 0.3));
  const back = Math.min(Math.max(1, Math.floor(m * 0.4)), Math.max(1, Q));
  const adj = Math.min(Math.max(1, Math.floor(m * 0.2)), Math.max(1, Q));

  const pattern = index % 4;
  let firstQty: number;
  const moves: Array<{ type: string; qty: number; reason: string }> = [];
  if (pattern === 0) {
    firstQty = Q + out1;
    moves.push({ type: "ISSUE", qty: out1, reason: "Issued for lab session" });
  } else if (pattern === 1) {
    firstQty = Q + out1 - back;
    moves.push({ type: "ISSUE", qty: out1, reason: "Issued for student project" });
    moves.push({ type: "RETURN", qty: back, reason: "Unused stock returned to store" });
  } else if (pattern === 2) {
    firstQty = Q + out1 + out2 - adj;
    moves.push({ type: "ISSUE", qty: out1, reason: "Issued for workshop batch" });
    moves.push({ type: "ISSUE", qty: out2, reason: "Issued for routine maintenance" });
    moves.push({ type: "ADJUSTMENT", qty: adj, reason: "Stock count correction (surplus)" });
  } else {
    firstQty = Q + out1;
    moves.push({ type: "TRANSFER", qty: Math.min(out1, Math.max(1, Q)), reason: `Reallocated to ${opts.transferToLabName}` });
    moves.push({ type: "ISSUE", qty: out1, reason: "Issued after transfer" });
  }

  const rows: LedgerRow[] = [];
  const chainLen = moves.length + 1;
  let balance = 0;
  // First transaction is the RECEIPT — oldest.
  const baseDaysAgo = 20 + (index % 18);
  const stepDays = 3;
  const firstDaysAgo = baseDaysAgo + chainLen * stepDays;
  rows.push({
    organizationId: orgId,
    itemId,
    type: "RECEIPT",
    quantity: firstQty,
    previousBalance: 0,
    newBalance: firstQty,
    transferToLabId: null,
    reason: "Initial stocking — supplier delivery",
    performedById: actorIds[index % actorIds.length],
    createdAt: daysAgo(firstDaysAgo, 9 + (index % 8)),
  });
  balance = firstQty;
  moves.forEach((mv, k) => {
    const daysAgoK = firstDaysAgo - (k + 1) * stepDays;
    let newBalance = balance;
    if (mv.type === "ISSUE" || mv.type === "DAMAGE" || mv.type === "EXPIRY") newBalance = balance - mv.qty;
    else if (mv.type === "RETURN" || mv.type === "ADJUSTMENT") newBalance = balance + mv.qty;
    // TRANSFER keeps the balance; the item's lab changes (already reflected).
    rows.push({
      organizationId: orgId,
      itemId,
      type: mv.type,
      quantity: mv.qty,
      previousBalance: balance,
      newBalance,
      transferToLabId: mv.type === "TRANSFER" ? opts.transferToLabId : null,
      reason: mv.reason,
      performedById: actorIds[(index + k + 1) % actorIds.length],
      createdAt: daysAgo(Math.max(1, daysAgoK), 10 + ((index + k) % 7)),
    });
    balance = newBalance;
  });
  if (balance !== Q) {
    throw new Error(`Ledger chain mismatch for item ${itemId}: ends at ${balance}, expected ${Q}`);
  }
  return rows;
}

async function ensureInventoryItem(
  orgId: string,
  seed: {
    lab: LabRow;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unit: string;
    minQuantity: number;
    location: string;
  },
  index: number,
  actorIds: string[]
) {
  const existing = await db.inventoryItem.findFirst({
    where: { organizationId: orgId, sku: seed.sku },
    include: { _count: { select: { transactions: true } } },
  });
  let item = existing;
  if (!item) {
    item = await db.inventoryItem.create({
      data: {
        organizationId: orgId,
        labId: seed.lab.id,
        name: seed.name,
        sku: seed.sku,
        category: seed.category,
        quantity: seed.quantity,
        unit: seed.unit,
        minQuantity: seed.minQuantity,
        location: seed.location,
      },
      include: { _count: { select: { transactions: true } } },
    });
  }
  // Backfill ledger history when the item has none (new or legacy row) —
  // chain ends exactly at the item's CURRENT quantity.
  if (item._count.transactions === 0) {
    const chain = buildLedgerChain({
      orgId,
      itemId: item.id,
      finalQty: item.quantity,
      minQuantity: item.minQuantity,
      index,
      transferToLabId: seed.lab.id,
      transferToLabName: seed.lab.name,
      actorIds,
    });
    await db.inventoryTransaction.createMany({ data: chain });
  }
  return item;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("Seeding LabVault v2 demo data…");

  const org = await ensureOrg();
  const orgId = org.id;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---- Departments ----
  const [cse, ece, me, lss] = await Promise.all([
    ensureDepartment(orgId, { name: "Computer Science", code: "CSE" }),
    ensureDepartment(orgId, { name: "Electronics", code: "ECE" }),
    ensureDepartment(orgId, { name: "Mechanical", code: "ME" }),
    ensureDepartment(orgId, { name: "Life Sciences", code: "LSS" }),
  ]);

  // ---- Users ----
  const userSpecs = [
    { email: "admin@labvault.io", name: "Aarav Sharma", role: "ADMIN", department: "Administration", phone: "+91 98200 11001" },
    { email: "manager@labvault.io", name: "Shyamali Samant", role: "LAB_MANAGER", department: "Lab Operations", phone: "+91 98200 11002" },
    { email: "instructor@labvault.io", name: "Kaif Kenwey", role: "INSTRUCTOR", department: "Electronics", phone: "+91 98200 11003" },
    { email: "tech@labvault.io", name: "Ravi Verma", role: "TECHNICIAN", department: "Maintenance", phone: "+91 98200 11004" },
    { email: "student@labvault.io", name: "Priya Nair", role: "STUDENT", department: "Computer Science", phone: "+91 98200 11005" },
    { email: "student2@labvault.io", name: "Dev Mehta", role: "STUDENT", department: "Electronics", phone: "+91 98200 11006" },
  ].map((u) => ({ ...u, passwordHash }));
  const [admin, manager, instructor, technician, student, student2] = await Promise.all(
    userSpecs.map((u) => ensureOrgUser(orgId, u))
  );

  // ---- Labs (5) ----
  const csl = await ensureLab(orgId, {
    code: "CSL-201", name: "AI & Computing Lab", location: "Block B · Floor 2", capacity: 60,
    description: "GPU workstations and high-performance compute for AI, OS and networks coursework.",
    departmentId: cse.id, managerId: manager.id,
  });
  const ecl = await ensureLab(orgId, {
    code: "ECL-101", name: "Electronics & Embedded Lab", location: "Block A · Floor 1", capacity: 40,
    description: "Embedded systems benches with scopes, logic analyzers and soldering stations.",
    departmentId: ece.id, managerId: manager.id,
  });
  const mwl = await ensureLab(orgId, {
    code: "MWL-105", name: "Mechanical Workshop", location: "Block E · Ground Floor", capacity: 25,
    description: "Machining shop with CNC mill, lathe, welding bays and metrology corner.",
    departmentId: me.id, managerId: manager.id,
  });
  const bio = await ensureLab(orgId, {
    code: "BIO-301", name: "Biology Lab", location: "Block C · Floor 3", capacity: 30,
    description: "Microbiology and molecular biology wet lab with biosafety cabinet and PCR suite.",
    departmentId: lss.id, managerId: manager.id,
  });
  const opl = await ensureLab(orgId, {
    code: "OPL-401", name: "Optics & Photonics Lab", location: "Block D · Floor 4", capacity: 20,
    description: "Laser optics benches, spectrometers and a blackout dark room for photonics work.",
    departmentId: ece.id, managerId: instructor.id,
  });
  const labs = [csl, ecl, mwl, bio, opl];

  // ---- Courses (4) ----
  await Promise.all([
    ensureCourse(orgId, { code: "CS-301", title: "Computer Networks", description: "Layered architectures, TCP/IP congestion control and network measurement.", departmentId: cse.id, instructorId: instructor.id }),
    ensureCourse(orgId, { code: "EC-205", title: "Embedded Systems", description: "Microcontroller interfacing, real-time firmware and instrumentation buses.", departmentId: ece.id, instructorId: instructor.id }),
    ensureCourse(orgId, { code: "ME-110", title: "CAD Workshop", description: "Parametric modelling, GD&T and assembly drawing practice.", departmentId: me.id, instructorId: instructor.id }),
    ensureCourse(orgId, { code: "LS-210", title: "Microbiology", description: "Sterile technique, staining protocols and culture-based assays.", departmentId: lss.id, instructorId: instructor.id }),
  ]);

  // ---- Equipment (37) ----
  const equipmentSpecs: EquipmentSeed[] = [
    // AI & Computing Lab
    { lab: csl, name: "GPU Workstation RTX 4090", code: "EQ-CSL-01", category: "COMPUTING", status: "IN_USE", condition: "EXCELLENT", manufacturer: "NVIDIA", price: 320000 },
    { lab: csl, name: "GPU Training Node A100", code: "EQ-CSL-02", category: "COMPUTING", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "NVIDIA", price: 850000 },
    { lab: csl, name: "Network Packet Simulator", code: "EQ-CSL-03", category: "COMPUTING", status: "AVAILABLE", condition: "GOOD", manufacturer: "Cisco", price: 210000 },
    { lab: csl, name: "Rack Server 2U", code: "EQ-CSL-04", category: "COMPUTING", status: "AVAILABLE", condition: "GOOD", manufacturer: "Dell EMC", price: 480000 },
    { lab: csl, name: "Workstation i9 128GB", code: "EQ-CSL-05", category: "COMPUTING", status: "AVAILABLE", condition: "GOOD", manufacturer: "HP", price: 240000 },
    { lab: csl, name: "3D Printer Prusa MK4", code: "EQ-CSL-06", category: "GENERAL", status: "UNDER_MAINTENANCE", condition: "FAIR", manufacturer: "Prusa", price: 85000 },
    { lab: csl, name: "KVM Switch 8-port", code: "EQ-CSL-07", category: "ELECTRICAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Aten", price: 22000 },
    { lab: csl, name: "Label Printer Industrial", code: "EQ-CSL-08", category: "GENERAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Zebra", price: 34000 },
    // Electronics & Embedded Lab
    { lab: ecl, name: "Digital Storage Oscilloscope 200MHz", code: "EQ-ECL-01", category: "INSTRUMENT", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Rigol", price: 120000 },
    { lab: ecl, name: "Function Generator 25MHz", code: "EQ-ECL-02", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Siglent", price: 45000 },
    { lab: ecl, name: "DC Power Supply 30V/5A", code: "EQ-ECL-03", category: "ELECTRICAL", status: "IN_USE", condition: "GOOD", manufacturer: "Keysight", price: 62000 },
    { lab: ecl, name: "Soldering Station Duo", code: "EQ-ECL-04", category: "GENERAL", status: "AVAILABLE", condition: "FAIR", manufacturer: "Weller", price: 18000 },
    { lab: ecl, name: "Logic Analyzer 16ch", code: "EQ-ECL-05", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Saleae", price: 95000 },
    { lab: ecl, name: "Spectrum Analyzer 3GHz", code: "EQ-ECL-06", category: "INSTRUMENT", status: "UNDER_MAINTENANCE", condition: "FAIR", manufacturer: "Rohde & Schwarz", price: 750000 },
    { lab: ecl, name: "Bench Multimeter 5.5 Digit", code: "EQ-ECL-07", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Keysight", price: 78000 },
    { lab: ecl, name: "Embedded Dev Board Rack", code: "EQ-ECL-08", category: "ELECTRICAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Texas Instruments", price: 56000 },
    { lab: ecl, name: "Wire Tracer & Tone Kit", code: "EQ-ECL-09", category: "ELECTRICAL", status: "RETIRED", condition: "POOR", manufacturer: "Fluke", price: 24000 },
    // Mechanical Workshop
    { lab: mwl, name: "CNC Milling Machine 3-Axis", code: "EQ-MWL-01", category: "GENERAL", status: "UNDER_MAINTENANCE", condition: "FAIR", manufacturer: "Haas", price: 2450000 },
    { lab: mwl, name: "Lathe Machine 6ft", code: "EQ-MWL-02", category: "GENERAL", status: "IN_USE", condition: "GOOD", manufacturer: "Ace Designers", price: 520000 },
    { lab: mwl, name: "Hydraulic Press 20T", code: "EQ-MWL-03", category: "GENERAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Godrej", price: 310000 },
    { lab: mwl, name: "Coordinate Measuring Machine", code: "EQ-MWL-04", category: "INSTRUMENT", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Zeiss", price: 1850000 },
    { lab: mwl, name: "MIG Welding Station", code: "EQ-MWL-05", category: "ELECTRICAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Lincoln Electric", price: 145000 },
    { lab: mwl, name: "Band Saw Industrial", code: "EQ-MWL-06", category: "GENERAL", status: "RETIRED", condition: "POOR", manufacturer: "Bosch", price: 96000 },
    { lab: mwl, name: "Surface Grinder", code: "EQ-MWL-07", category: "GENERAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Abhiyant", price: 420000 },
    // Biology Lab
    { lab: bio, name: "Centrifuge 15000 RPM", code: "EQ-BIO-01", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Eppendorf", price: 190000 },
    { lab: bio, name: "Biosafety Cabinet Class II", code: "EQ-BIO-02", category: "SAFETY", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Thermo Fisher", price: 680000 },
    { lab: bio, name: "Autoclave 75L", code: "EQ-BIO-03", category: "SAFETY", status: "AVAILABLE", condition: "GOOD", manufacturer: "Equitron", price: 240000 },
    { lab: bio, name: "PCR Thermal Cycler", code: "EQ-BIO-04", category: "INSTRUMENT", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Bio-Rad", price: 520000 },
    { lab: bio, name: "CO2 Incubator", code: "EQ-BIO-05", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Binder", price: 410000 },
    { lab: bio, name: "Microscope Binocular 1000x", code: "EQ-BIO-06", category: "OPTICS", status: "AVAILABLE", condition: "GOOD", manufacturer: "Olympus", price: 88000 },
    { lab: bio, name: "Deep Freezer -20C", code: "EQ-BIO-07", category: "ELECTRICAL", status: "AVAILABLE", condition: "GOOD", manufacturer: "Vestfrost", price: 160000 },
    // Optics & Photonics Lab
    { lab: opl, name: "He-Ne Laser 632nm", code: "EQ-OPL-01", category: "OPTICS", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Thorlabs", price: 150000 },
    { lab: opl, name: "Optical Table 4ft", code: "EQ-OPL-02", category: "OPTICS", status: "AVAILABLE", condition: "GOOD", manufacturer: "Newport", price: 380000 },
    { lab: opl, name: "UV-Vis Spectrophotometer", code: "EQ-OPL-03", category: "INSTRUMENT", status: "AVAILABLE", condition: "EXCELLENT", manufacturer: "Shimadzu", price: 480000 },
    { lab: opl, name: "Fiber Optic Kit Pro", code: "EQ-OPL-04", category: "OPTICS", status: "AVAILABLE", condition: "GOOD", manufacturer: "Thorlabs", price: 95000 },
    { lab: opl, name: "Handheld Optical Power Meter", code: "EQ-OPL-05", category: "INSTRUMENT", status: "AVAILABLE", condition: "GOOD", manufacturer: "Thorlabs", price: 62000 },
    { lab: opl, name: "Beam Expander Mount Set", code: "EQ-OPL-06", category: "OPTICS", status: "AVAILABLE", condition: "GOOD", manufacturer: "Edmund Optics", price: 44000 },
  ];
  const equipment = await Promise.all(
    equipmentSpecs.map((e, i) => ensureEquipment(orgId, admin.id, e, i))
  );
  const eq = (code: string) => equipment[equipmentSpecs.findIndex((s) => s.code === code)];

  // Backfill CREATED events for any pre-v2 equipment without events.
  const legacyEquipment = await db.equipment.findMany({
    where: { organizationId: orgId, events: { none: {} } },
  });
  for (const e of legacyEquipment) {
    await db.equipmentEvent.create({
      data: {
        organizationId: orgId,
        equipmentId: e.id,
        type: "CREATED",
        newStatus: "AVAILABLE",
        notes: "Asset registered (legacy import)",
        actorId: admin.id,
        createdAt: e.purchaseDate ?? e.createdAt,
      },
    });
    if (e.status !== "AVAILABLE") {
      await db.equipmentEvent.create({
        data: {
          organizationId: orgId,
          equipmentId: e.id,
          type: "STATUS_CHANGED",
          previousStatus: "AVAILABLE",
          newStatus: e.status,
          notes: "Status migrated from v1 records",
          actorId: admin.id,
          createdAt: daysAgo(30, 11),
        },
      });
    }
  }

  // ---- Inventory items (105) with ledger-correct history ----
  const CONSUMABLES = ["Nitrile Gloves (M)", "Isopropanol Wipes 70%", "Filter Paper Circles 110mm", "Lint-Free Wipes", "Thermal Paste 4g Tube", "Sample Vials 2mL (50pk)", "Petri Dish 90mm (20pk)", "Aluminium Foil Roll 30cm", "Parafilm Roll 4in", "Micropipette Tips 1000uL (96pk)", "Cellulose Sponges (5pk)", "Silica Gel Desiccant 500g"];
  const SPARES = ["Ball Bearing 608ZZ (10pk)", "GT2 Timing Belt 6mm", "M3 Nylon Standoff Kit", "Fuse Assortment 5x20mm", "O-Ring Kit Metric (80pc)", "Cooling Fan 80mm 12V", "Timing Pulley 20T 5mm Bore", "BNC Cable 1m", "Relay Module SPDT 10A", "Buck Converter Module 12V-5V", "LM35 Temperature Sensor (5pk)", "Ribbon Cable 16-way 1m"];
  const SAFETY = ["Safety Goggles Clear", "Face Shield Full", "N95 Dust Masks (10pk)", "Cut-Resistant Gloves L", "First Aid Kit Refill", "Emergency Eyewash Bottle 1L", "Fire Blanket 1.8m", "Hearing Protection Ear Muffs", "Chemical Spill Kit Compact", "UV Safety Glasses"];
  const STATIONERY = ["Lab Notebook A4 Quadrille", "Permanent Markers (4pk)", "Cryogenic Labels (500)", "Label Tape Roll 19mm", "Clipboard A4", "Print Paper Ream A4", "Archival Pens 0.5 (3pk)", "Sample Bag Roll 150mm"];
  const UNITS: Record<string, string[]> = {
    CONSUMABLE: ["packs", "boxes", "rolls", "pcs"],
    SPARE: ["kits", "pcs"],
    SAFETY: ["pcs", "boxes"],
    STATIONERY: ["packs", "reams"],
  };
  const LOW_STOCK_COUNT = 8;

  type InventorySeed = {
    lab: LabRow;
    name: string;
    sku: string;
    category: string;
    quantity: number;
    unit: string;
    minQuantity: number;
    location: string;
    low: boolean;
  };
  const inventorySeeds: InventorySeed[] = [];
  const PER_LAB = 21;
  for (let i = 0; i < labs.length * PER_LAB; i++) {
    const lab = labs[Math.floor(i / PER_LAB)];
    const catRoll = ["CONSUMABLE", "SPARE", "SAFETY", "STATIONERY", "CONSUMABLE", "SPARE", "SAFETY", "CONSUMABLE"][i % 8];
    const pool = catRoll === "CONSUMABLE" ? CONSUMABLES : catRoll === "SPARE" ? SPARES : catRoll === "SAFETY" ? SAFETY : STATIONERY;
    const name = pool[(i * 5 + Math.floor(i / PER_LAB)) % pool.length];
    const minQuantity = 5 + (i % 4) * 5; // 5..20
    const isLow = i % 13 === 5 && inventorySeeds.filter((s) => s.low).length < LOW_STOCK_COUNT;
    const quantity = isLow
      ? Math.max(1, minQuantity - 1 - (i % 3))
      : minQuantity + 2 + ((i * 7) % (minQuantity * 4 + 8));
    const unit = UNITS[catRoll][i % UNITS[catRoll].length];
    const location = `Store ${lab.code} · Rack ${1 + (i % 6)} · Bin ${String.fromCharCode(65 + (i % 4))}${1 + (i % 3)}`;
    inventorySeeds.push({
      lab, name, sku: `INV-${String(1001 + i)}`, category: catRoll,
      quantity, unit, minQuantity, location, low: isLow,
    });
  }
  const actorIds = [technician.id, manager.id];
  const inventoryItems = await Promise.all(
    inventorySeeds.map((s, i) => ensureInventoryItem(orgId, s, i, actorIds))
  );
  const itemBySku = (sku: string) => {
    const idx = inventorySeeds.findIndex((s) => s.sku === sku);
    return inventoryItems[idx];
  };
  const lowStockItem = inventoryItems[inventorySeeds.findIndex((s) => s.low)];

  // ---- Chemicals (8) ----
  const chemSpecs = [
    { lab: bio, name: "Ethanol 99.9%", casNumber: "64-17-5", hazardClass: "FLAMMABLE", quantity: 4000, unit: "mL", expiryDays: 400, batchNumber: "ETH-25114", supplier: "ChemSupply India", storageLocation: "Flammables Safe" },
    { lab: bio, name: "Sodium Hydroxide 1M", casNumber: "1310-73-2", hazardClass: "CORROSIVE", quantity: 2500, unit: "mL", expiryDays: 210, batchNumber: "NAOH-25-87", supplier: "ChemSupply India", storageLocation: "Base Cabinet" },
    { lab: bio, name: "Hydrochloric Acid 37%", casNumber: "7647-01-0", hazardClass: "CORROSIVE", quantity: 1200, unit: "mL", expiryDays: 18, batchNumber: "HCL-26-03", supplier: "ChemSupply India", storageLocation: "Acid Cabinet" },
    { lab: bio, name: "Methanol", casNumber: "67-56-1", hazardClass: "TOXIC", quantity: 800, unit: "mL", expiryDays: 150, batchNumber: "MEOH-25-52", supplier: "ChemSupply India", storageLocation: "Flammables Safe" },
    { lab: bio, name: "Buffer Solution pH 7", casNumber: null, hazardClass: "LOW", quantity: 3000, unit: "mL", expiryDays: -12, batchNumber: "BUF-24-19", supplier: "LabConsumables Direct", storageLocation: "Shelf E1" },
    { lab: mwl, name: "Acetone Technical Grade", casNumber: "67-64-1", hazardClass: "FLAMMABLE", quantity: 2500, unit: "mL", expiryDays: 25, batchNumber: "ACT-26-08", supplier: "LabConsumables Direct", storageLocation: "Degreasing Station" },
    { lab: bio, name: "Hydrogen Peroxide 3%", casNumber: "7722-84-1", hazardClass: "REACTIVE", quantity: 1000, unit: "mL", expiryDays: 300, batchNumber: "H2O2-25-40", supplier: "ChemSupply India", storageLocation: "Oxidizer Cabinet" },
    { lab: bio, name: "Eosin Y Stain 1%", casNumber: "17372-87-1", hazardClass: "LOW", quantity: 500, unit: "mL", expiryDays: 95, batchNumber: "EOS-25-63", supplier: "Scientific Instruments Co.", storageLocation: "Stain Shelf" },
  ];
  const chemicals: Chemical[] = [];
  for (const c of chemSpecs) {
    const existing = await db.chemical.findFirst({ where: { organizationId: orgId, name: c.name } });
    const data = {
      labId: c.lab.id,
      casNumber: c.casNumber,
      batchNumber: c.batchNumber,
      supplier: c.supplier,
      quantity: c.quantity,
      unit: c.unit,
      hazardClass: c.hazardClass,
      expiryDate: c.expiryDays >= 0 ? daysAhead(c.expiryDays, 17) : daysAgo(-c.expiryDays, 17),
      storageLocation: c.storageLocation,
    };
    chemicals.push(
      existing
        ? await db.chemical.update({ where: { id: existing.id }, data })
        : await db.chemical.create({ data: { organizationId: orgId, name: c.name, ...data } })
    );
  }
  const expiredChemical = chemicals.find((c) => c.name === "Buffer Solution pH 7")!;

  // ---- Maintenance work orders (6) — v2 statuses ----
  // Migrate legacy v1 statuses (SCHEDULED) to the v2 set first.
  const legacyWOs = await db.maintenanceRecord.findMany({
    where: { organizationId: orgId, status: "SCHEDULED" },
  });
  for (const wo of legacyWOs) {
    await db.maintenanceRecord.update({
      where: { id: wo.id },
      data: { status: wo.technicianId ? "ASSIGNED" : "OPEN" },
    });
  }

  const woSpecs = [
    { title: "WO-2601 CNC spindle overload trips", equipmentCode: "EQ-MWL-01", type: "CORRECTIVE", priority: "CRITICAL", status: "IN_PROGRESS", scheduledDays: -3, startedDays: 2, issue: "Spindle motor trips breaker under load — suspected bearing seizure.", technician: true, notes: "Machine tagged out. Bearing kit ordered for spindle rebuild." },
    { title: "WO-2602 3D printer bed adhesion and nozzle service", equipmentCode: "EQ-CSL-06", type: "PREVENTIVE", priority: "MEDIUM", status: "IN_PROGRESS", scheduledDays: -2, startedDays: 1, issue: "First-layer failures across recent jobs; extruder calibration drifting.", technician: true, notes: "Full nozzle swap, bed re-level and PID tune in progress." },
    { title: "WO-2603 Spectrum analyzer LO module failure", equipmentCode: "EQ-ECL-06", type: "CORRECTIVE", priority: "HIGH", status: "WAITING_FOR_PARTS", scheduledDays: -6, startedDays: 5, issue: "No IF output above 1GHz; local oscillator synthesizer module suspected dead.", technician: true, notes: "Waiting on Rohde & Schwarz replacement module (ETA 5 days)." },
    { title: "WO-2604 Autoclave quarterly validation", equipmentCode: "EQ-BIO-03", type: "PREVENTIVE", priority: "MEDIUM", status: "ASSIGNED", scheduledDays: -3, startedDays: null, issue: "Quarterly pressure and temperature validation due.", technician: true, notes: "Validation run scheduled with external certifier." },
    { title: "WO-2605 Hydraulic press hose inspection", equipmentCode: "EQ-MWL-03", type: "PREVENTIVE", priority: "LOW", status: "OPEN", scheduledDays: -7, startedDays: null, issue: "Annual hydraulic hose and fitting inspection.", technician: false, notes: null },
    { title: "WO-2606 Centrifuge rotor imbalance fix", equipmentCode: "EQ-BIO-01", type: "CORRECTIVE", priority: "MEDIUM", status: "COMPLETED", scheduledDays: -12, startedDays: 11, completedDays: 10, issue: "Rotor wobble at high RPM; imbalance sensor faults.", technician: true, notes: "Rotor replaced and re-balanced. Vibration within spec.", downtimeHours: 6.5, laborCost: 2500, partsCost: 4800 },
  ];
  const workOrders: MaintenanceRecord[] = [];
  for (const w of woSpecs) {
    const existing = await db.maintenanceRecord.findFirst({
      where: { organizationId: orgId, title: w.title },
    });
    const scheduledAt = daysAhead(w.scheduledDays, 9);
    const startedAt = w.startedDays != null ? daysAgo(w.startedDays, 8) : null;
    const completedAt = w.completedDays != null ? daysAgo(w.completedDays, 16) : null;
    const data = {
      equipmentId: eq(w.equipmentCode).id,
      technicianId: w.technician ? technician.id : null,
      type: w.type,
      priority: w.priority,
      status: w.status,
      issue: w.issue,
      scheduledAt,
      startedAt,
      completedAt,
      downtimeHours: w.downtimeHours ?? null,
      laborCost: w.laborCost ?? 0,
      partsCost: w.partsCost ?? 0,
      cost: (w.laborCost ?? 0) + (w.partsCost ?? 0),
      notes: w.notes,
    };
    workOrders.push(
      existing
        ? await db.maintenanceRecord.update({ where: { id: existing.id }, data })
        : await db.maintenanceRecord.create({ data: { organizationId: orgId, title: w.title, ...data } })
    );
    // Lifecycle events for the equipment timeline
    const evExists = async (type: string) =>
      await db.equipmentEvent.findFirst({ where: { organizationId: orgId, equipmentId: data.equipmentId, type, notes: { contains: w.title.slice(0, 12) } } });
    if (startedAt && !(await evExists("MAINTENANCE_STARTED"))) {
      await db.equipmentEvent.create({
        data: {
          organizationId: orgId, equipmentId: data.equipmentId, type: "MAINTENANCE_STARTED",
          previousStatus: "AVAILABLE", newStatus: "UNDER_MAINTENANCE",
          notes: `${w.title}`, actorId: technician.id, createdAt: startedAt,
        },
      });
    }
    if (completedAt && !(await evExists("MAINTENANCE_COMPLETED"))) {
      await db.equipmentEvent.create({
        data: {
          organizationId: orgId, equipmentId: data.equipmentId, type: "MAINTENANCE_COMPLETED",
          previousStatus: "UNDER_MAINTENANCE", newStatus: "AVAILABLE",
          notes: `${w.title} — back in service`, actorId: technician.id, createdAt: completedAt,
        },
      });
    }
  }
  const criticalWO = workOrders[0];
  const assignedWO = workOrders[3];

  // ---- Calibration records (8) ----
  const calSpecs = [
    { equipmentCode: "EQ-ECL-01", result: "PASS", dueInDays: 180, certificateNumber: "CAL-CERT-2026-0141", provider: "Precision Cal Services", deviation: 0.4, standard: "Reference standard NIST-traceable", daysAgo: 185, notes: "Vertical accuracy verified at 1kHz/10MHz." },
    { equipmentCode: "EQ-ECL-02", result: "PASS", dueInDays: 150, certificateNumber: "CAL-CERT-2026-0142", provider: "Precision Cal Services", deviation: 0.2, standard: "Frequency counter reference", daysAgo: 215, notes: "Amplitude flatness within tolerance." },
    { equipmentCode: "EQ-ECL-05", result: "PASS", dueInDays: 240, certificateNumber: "CAL-CERT-2026-0143", provider: "Apex Metrology Labs", deviation: 0.1, standard: "Signal reference generator", daysAgo: 125, notes: "Timing skew verified on all 16 channels." },
    { equipmentCode: "EQ-ECL-07", result: "PASS", dueInDays: 120, certificateNumber: "CAL-CERT-2026-0144", provider: "Precision Cal Services", deviation: 0.05, standard: "Voltage reference 7.5V", daysAgo: 245, notes: "DC gain accuracy verified." },
    { equipmentCode: "EQ-BIO-04", result: "PASS", dueInDays: 20, certificateNumber: "CAL-CERT-2026-0145", provider: "BioCal Instruments", deviation: 0.8, standard: "NIST thermometer probe", daysAgo: 345, notes: "Block temperature uniformity checked at 95C." },
    { equipmentCode: "EQ-OPL-05", result: "PASS", dueInDays: 12, certificateNumber: "CAL-CERT-2026-0146", provider: "OptiCal Systems", deviation: 1.2, standard: "Photodiode power reference", daysAgo: 353, notes: "Wavelength response sweep 400-1100nm." },
    { equipmentCode: "EQ-MWL-04", result: "PASS", dueInDays: -15, certificateNumber: "CAL-CERT-2025-0098", provider: "Apex Metrology Labs", deviation: 1.9, standard: "Gauge block set grade 1", daysAgo: 380, notes: "Renewal booking raised with provider." },
    { equipmentCode: "EQ-BIO-01", result: "FAIL", dueInDays: 90, certificateNumber: "CAL-CERT-2026-0147", provider: "BioCal Instruments", deviation: 6.4, standard: "Tachometer reference", daysAgo: 20, notes: "RPM reading deviates beyond tolerance at 12000 RPM. Send for service." },
  ];
  const calibrations: CalibrationRecord[] = [];
  for (const c of calSpecs) {
    const existing = await db.calibrationRecord.findFirst({
      where: { organizationId: orgId, certificateNumber: c.certificateNumber },
    });
    const lastCalibratedAt = daysAgo(c.daysAgo, 11);
    const nextDueAt = daysAhead(c.dueInDays, 11);
    const status =
      c.result === "FAIL" ? "FAILED" : nextDueAt.getTime() < Date.now() ? "OVERDUE" : nextDueAt.getTime() < Date.now() + 30 * DAY ? "DUE_SOON" : "VALID";
    const data = {
      equipmentId: eq(c.equipmentCode).id,
      standard: c.standard,
      provider: c.provider,
      lastCalibratedAt,
      nextDueAt,
      certificateNumber: c.certificateNumber,
      result: c.result,
      deviation: c.deviation,
      status,
      notes: c.notes,
    };
    calibrations.push(
      existing
        ? await db.calibrationRecord.update({ where: { id: existing.id }, data })
        : await db.calibrationRecord.create({ data: { organizationId: orgId, ...data } })
    );
    if (c.result === "PASS") {
      const evt = await db.equipmentEvent.findFirst({
        where: { organizationId: orgId, equipmentId: data.equipmentId, type: "CALIBRATION_COMPLETED", notes: { contains: c.certificateNumber } },
      });
      if (!evt) {
        await db.equipmentEvent.create({
          data: {
            organizationId: orgId, equipmentId: data.equipmentId, type: "CALIBRATION_COMPLETED",
            notes: `Calibration ${c.certificateNumber} passed (provider: ${c.provider})`,
            actorId: technician.id, createdAt: lastCalibratedAt,
          },
        });
      }
    }
  }

  // ---- Reservations (8) ----
  const resSpecs = [
    { equipmentCode: "EQ-ECL-01", user: student, startDays: -5, endDays: -5, startHour: 9, endHour: 12, status: "COMPLETED", purpose: "Signals lab — waveform capture practice", completed: true },
    { equipmentCode: "EQ-OPL-03", user: student2, startDays: 2, endDays: 2, startHour: 14, endHour: 17, status: "PENDING", purpose: "Absorbance spectrum of synthesized dye" },
    { equipmentCode: "EQ-CSL-01", user: student, startDays: 3, endDays: 3, startHour: 10, endHour: 13, status: "PENDING", purpose: "CNN training run — Batch B" },
    { equipmentCode: "EQ-BIO-01", user: student, startDays: 1, endDays: 1, startHour: 9, endHour: 12, status: "APPROVED", purpose: "Cell culture spin-down protocol" },
    { equipmentCode: "EQ-MWL-02", user: student2, activeWindowHours: [-2, 3], status: "ACTIVE", purpose: "Lathe practice — turning job 4", active: true },
    { equipmentCode: "EQ-BIO-04", user: student2, startDays: -1, endDays: -1, startHour: 11, endHour: 13, status: "NO_SHOW", purpose: "PCR run for plasmid screening" },
    { equipmentCode: "EQ-MWL-01", user: student, startDays: -4, endDays: -4, startHour: 10, endHour: 12, status: "REJECTED", purpose: "CNC job setup assessment" },
    { equipmentCode: "EQ-OPL-02", user: student2, startDays: 5, endDays: 5, startHour: 13, endHour: 16, status: "CANCELLED", purpose: "Optical bench alignment practice" },
  ];
  const reservations: Reservation[] = [];
  for (const r of resSpecs) {
    const existing = await db.reservation.findFirst({
      where: { organizationId: orgId, purpose: r.purpose },
    });
    let startAt: Date;
    let endAt: Date;
    if (r.activeWindowHours) {
      startAt = new Date(Date.now() + r.activeWindowHours[0] * 3600 * 1000);
      endAt = new Date(Date.now() + r.activeWindowHours[1] * 3600 * 1000);
    } else if (r.startDays < 0) {
      startAt = daysAgo(-r.startDays, r.startHour!);
      endAt = daysAgo(-r.endDays!, r.endHour!);
    } else {
      startAt = daysAhead(r.startDays, r.startHour!);
      endAt = daysAhead(r.endDays!, r.endHour!);
    }
    const data = {
      equipmentId: eq(r.equipmentCode).id,
      userId: r.user.id,
      startAt,
      endAt,
      status: r.status,
      purpose: r.purpose,
      checkedInAt: r.active ? startAt : null,
      activatedAt: r.active ? startAt : null,
      completedAt: r.completed ? endAt : null,
    };
    reservations.push(
      existing
        ? await db.reservation.update({ where: { id: existing.id }, data })
        : await db.reservation.create({ data: { organizationId: orgId, ...data } })
    );
  }
  const approvedReservation = reservations[3];

  // ---- Checkouts (5) ----
  const checkoutSpecs = [
    { equipmentCode: "EQ-CSL-01", user: student, outDays: 2, dueDays: -5, status: "ACTIVE", conditionOut: "GOOD", accessoriesOut: "2x power cables", notes: "Seed: GPU workstation project checkout" },
    { equipmentCode: "EQ-ECL-03", user: student2, outDays: 12, dueDays: -2, status: "ACTIVE", conditionOut: "GOOD", notes: "Seed: bench power supply checkout (overdue)", overdue: true },
    { equipmentCode: "EQ-ECL-07", user: student, outDays: 20, dueDays: 6, inDays: 6, status: "RETURNED", conditionOut: "GOOD", conditionIn: "GOOD", notes: "Seed: multimeter returns" },
    { equipmentCode: "EQ-ECL-02", user: student2, outDays: 30, dueDays: 23, inDays: 23, status: "RETURNED", conditionOut: "EXCELLENT", conditionIn: "EXCELLENT", notes: "Seed: function generator returns" },
    { equipmentCode: "EQ-ECL-04", user: student, outDays: 15, dueDays: 8, inDays: 8, status: "RETURNED", conditionOut: "FAIR", conditionIn: "GOOD", issuedBy: technician, notes: "Seed: soldering station issued by technician" },
  ];
  const checkouts: Checkout[] = [];
  for (const c of checkoutSpecs) {
    const existing = await db.checkout.findFirst({
      where: { organizationId: orgId, equipmentId: eq(c.equipmentCode).id, notes: c.notes },
    });
    const checkedOutAt = daysAgo(c.outDays, 10);
    const checkedInAt = c.inDays != null ? daysAgo(c.inDays, 16) : null;
    const data = {
      equipmentId: eq(c.equipmentCode).id,
      userId: c.user.id,
      checkedOutAt,
      dueAt: c.dueDays >= 0 ? daysAhead(c.dueDays, 18) : daysAgo(-c.dueDays, 18),
      checkedInAt,
      status: c.status,
      conditionOut: c.conditionOut ?? null,
      conditionIn: c.conditionIn ?? null,
      accessoriesOut: c.accessoriesOut ?? null,
      issuedById: c.issuedBy ? c.issuedBy.id : null,
      notes: c.notes,
    };
    checkouts.push(
      existing
        ? await db.checkout.update({ where: { id: existing.id }, data })
        : await db.checkout.create({ data: { organizationId: orgId, ...data } })
    );
  }
  const overdueCheckout = checkouts[1];

  // ---- Vendors (3) ----
  const vendorSpecs = [
    { name: "Scientific Instruments Co.", contactEmail: "sales@scico.example", phone: "+91 98200 11223", address: "Andheri East, Mumbai", category: "EQUIPMENT", rating: 4.6 },
    { name: "ChemSupply India", contactEmail: "orders@chemsupply.example", phone: "+91 98111 44556", address: "Vashi, Navi Mumbai", category: "CHEMICALS", rating: 4.2 },
    { name: "LabConsumables Direct", contactEmail: "hello@labdirect.example", phone: "+91 99887 66554", address: "Whitefield, Bengaluru", category: "CONSUMABLES", rating: 3.9 },
  ];
  const vendors: Vendor[] = [];
  for (const v of vendorSpecs) {
    const existing = await db.vendor.findFirst({ where: { organizationId: orgId, name: v.name } });
    vendors.push(
      existing
        ? await db.vendor.update({ where: { id: existing.id }, data: v })
        : await db.vendor.create({ data: { organizationId: orgId, ...v } })
    );
  }
  const [vSci, vChem, vCons] = vendors;

  // ---- Purchase requests (4, mixed statuses) ----
  const prSpecs = [
    { itemName: "Digital Oscilloscope 200MHz (replacement batch)", vendor: vSci, requestedBy: instructor, quantity: 2, estimatedCost: 240000, status: "SUBMITTED", justification: "Second teaching bench needs parallel scopes for EC-205." },
    { itemName: "Hydrochloric Acid 37% AR Grade (6x2.5L)", vendor: vChem, requestedBy: manager, quantity: 6, estimatedCost: 12900, status: "APPROVED", justification: "Stock below reorder level after titration batches." },
    { itemName: "PLA Filament 1kg (spool pack)", vendor: vCons, requestedBy: manager, quantity: 10, estimatedCost: 21000, status: "ORDERED", justification: "CSL-06 printer backlog; filament below minimum." },
    { itemName: "Ball Bearing 608ZZ (10pk) restock", vendor: vCons, requestedBy: technician, quantity: 8, estimatedCost: 5600, status: "RECEIVED", justification: "Mechanical workshop spares replenishment." },
  ];
  const purchaseRequests: PurchaseRequest[] = [];
  for (const p of prSpecs) {
    const existing = await db.purchaseRequest.findFirst({
      where: { organizationId: orgId, itemName: p.itemName },
    });
    const data = {
      vendorId: p.vendor.id,
      requestedById: p.requestedBy.id,
      quantity: p.quantity,
      estimatedCost: p.estimatedCost,
      status: p.status,
      justification: p.justification,
    };
    purchaseRequests.push(
      existing
        ? await db.purchaseRequest.update({ where: { id: existing.id }, data })
        : await db.purchaseRequest.create({ data: { organizationId: orgId, itemName: p.itemName, ...data } })
    );
  }

  // ---- Purchase orders (3) + goods receipt (1) ----
  const linkItems = [itemBySku("INV-1018"), itemBySku("INV-1026")]; // spare-type items for PO lines
  const poSpecs = [
    {
      poNumber: "PO-2026-001", vendor: vSci, status: "ORDERED", orderedDays: 2, expectedDays: 14, received: false,
      purchaseRequest: purchaseRequests[2],
      items: [
        { name: "Digital Oscilloscope 200MHz", quantity: 2, unitCost: 120000, receivedQuantity: 0, inventoryItem: null as typeof inventoryItems[number] | null },
        { name: linkItems[0]?.name ?? "Ribbon Cable 16-way 1m", quantity: 40, unitCost: 90, receivedQuantity: 0, inventoryItem: linkItems[0] },
      ],
    },
    {
      poNumber: "PO-2026-002", vendor: vCons, status: "PARTIALLY_RECEIVED", orderedDays: 9, expectedDays: 3, received: false,
      purchaseRequest: purchaseRequests[3],
      items: [
        { name: "Nitrile Gloves (M)", quantity: 10, unitCost: 320, receivedQuantity: 4, inventoryItem: null },
        { name: linkItems[1]?.name ?? "Fuse Assortment 5x20mm", quantity: 6, unitCost: 450, receivedQuantity: 0, inventoryItem: linkItems[1] },
      ],
    },
    {
      poNumber: "PO-2026-003", vendor: vChem, status: "RECEIVED", orderedDays: 20, expectedDays: 5, receivedDays: 4, received: true,
      purchaseRequest: purchaseRequests[1],
      items: [
        { name: "Hydrochloric Acid 37% (5L)", quantity: 4, unitCost: 2150, receivedQuantity: 4, inventoryItem: null },
        { name: "Buffer Solution pH 7 (1L)", quantity: 6, unitCost: 380, receivedQuantity: 6, inventoryItem: null },
      ],
    },
  ];
  const purchaseOrders: PurchaseOrder[] = [];
  for (const po of poSpecs) {
    const existing = await db.purchaseOrder.findFirst({
      where: { organizationId: orgId, poNumber: po.poNumber },
      include: { items: true },
    });
    const totalCost = po.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
    const headData = {
      vendorId: po.vendor.id,
      purchaseRequestId: po.purchaseRequest?.id ?? null,
      createdById: manager.id,
      status: po.status,
      orderedAt: daysAgo(po.orderedDays, 12),
      expectedAt: po.expectedDays >= 0 ? daysAhead(po.expectedDays, 12) : daysAgo(-po.expectedDays, 12),
      receivedAt: po.receivedDays != null ? daysAgo(po.receivedDays, 15) : null,
      totalCost,
      notes: `Seeded order ${po.poNumber}`,
    };
    const order = existing
      ? await db.purchaseOrder.update({ where: { id: existing.id }, data: headData })
      : await db.purchaseOrder.create({ data: { organizationId: orgId, poNumber: po.poNumber, ...headData } });

    // Replace/ensure items
    const existingItems = existing?.items ?? [];
    for (let i = 0; i < po.items.length; i++) {
      const it = po.items[i];
      const itemData = {
        inventoryItemId: it.inventoryItem?.id ?? null,
        name: it.name,
        quantity: it.quantity,
        unitCost: it.unitCost,
        receivedQuantity: it.receivedQuantity,
      };
      const match = existingItems.find((e) => e.name === it.name);
      if (match) {
        await db.purchaseOrderItem.update({ where: { id: match.id }, data: itemData });
      } else if (!existingItems.some((e) => e.name === it.name)) {
        await db.purchaseOrderItem.create({
          data: { organizationId: orgId, orderId: order.id, ...itemData },
        });
      }
    }
    purchaseOrders.push(order);
  }

  // Goods receipt matching PO-2026-003
  const grSpec = poSpecs[2];
  const grOrder = purchaseOrders[2];
  const grExisting = await db.goodsReceipt.findFirst({
    where: { organizationId: orgId, invoiceNumber: "INV-CS-88121" },
    include: { items: true, order: { include: { items: true } } },
  });
  if (!grExisting) {
    const grItems = await db.purchaseOrderItem.findMany({
      where: { organizationId: orgId, orderId: grOrder.id },
    });
    await db.goodsReceipt.create({
      data: {
        organizationId: orgId,
        orderId: grOrder.id,
        receivedById: technician.id,
        invoiceNumber: "INV-CS-88121",
        notes: "Seeded receipt — all line items accepted, condition GOOD.",
        receivedAt: daysAgo(4, 15),
        items: {
          create: grItems.map((gi) => ({
            organizationId: orgId,
            orderItemId: gi.id,
            quantity: gi.receivedQuantity,
            condition: "GOOD",
          })),
        },
      },
    });
  }

  // ---- Experiments (5) ----
  const expSpecs = [
    { lab: ecl, code: "EXP-EC-01", title: "RC Circuit Transient Response", courseCode: "EC-205", description: "Measure charging/discharging of RC networks and extract time constants.", status: "ACTIVE" },
    { lab: csl, code: "EXP-CS-02", title: "TCP Congestion Control Analysis", courseCode: "CS-301", description: "Compare Reno vs CUBIC throughput under packet loss with the packet simulator.", status: "ACTIVE" },
    { lab: bio, code: "EXP-LS-03", title: "Gram Staining Protocol", courseCode: "LS-210", description: "Standard gram stain workflow on mixed culture smears.", status: "ACTIVE" },
    { lab: mwl, code: "EXP-ME-04", title: "CAD Assembly and Tolerance Stack", courseCode: "ME-110", description: "Assemble a gearbox model and validate tolerance stack-up.", status: "ACTIVE" },
    { lab: opl, code: "EXP-OP-05", title: "Double-Slit Interference", courseCode: null, description: "Estimate laser wavelength via fringe spacing on the optical bench.", status: "DRAFT" },
  ];
  const courses = await db.course.findMany({ where: { organizationId: orgId } });
  const courseByCode = (code: string | null) => (code ? courses.find((c) => c.code === code) : undefined);
  const experiments: Experiment[] = [];
  for (const e of expSpecs) {
    const existing = await db.experiment.findFirst({ where: { organizationId: orgId, code: e.code } });
    const data = {
      labId: e.lab.id,
      courseId: courseByCode(e.courseCode)?.id ?? null,
      instructorId: instructor.id,
      title: e.title,
      description: e.description,
      status: e.status,
    };
    experiments.push(
      existing
        ? await db.experiment.update({ where: { id: existing.id }, data })
        : await db.experiment.create({ data: { organizationId: orgId, code: e.code, ...data } })
    );
  }

  // ---- Lab sessions (5) ----
  const sessionSpecs = [
    { experimentIdx: 2, lab: bio, title: "Gram Staining — Batch A", days: -4, hour: 14, durationMin: 120, status: "COMPLETED", room: "BIO-301", remarks: "Good staining contrast overall; revisit decolorization timing." },
    { experimentIdx: 0, lab: ecl, title: "RC Circuit — Batch B", days: 2, hour: 9, durationMin: 120, status: "SCHEDULED", room: "ECL-101", remarks: null },
    { experimentIdx: 1, lab: csl, title: "TCP Congestion — Batch A", days: 3, hour: 11, durationMin: 90, status: "SCHEDULED", room: "CSL-201", remarks: null },
    { experimentIdx: 3, lab: mwl, title: "CAD Assembly — Batch B", days: -8, hour: 10, durationMin: 90, status: "COMPLETED", room: "MWL-105", remarks: "Assembly files submitted by 80% of batch." },
    { experimentIdx: 4, lab: opl, title: "Interference Patterns — Batch A", hoursAgo: -1, durationMin: 90, status: "IN_PROGRESS", room: "OPL-401", remarks: null },
  ];
  const sessions: LabSession[] = [];
  for (const s of sessionSpecs) {
    const existing = await db.labSession.findFirst({ where: { organizationId: orgId, title: s.title } });
    const scheduledAt = s.days != null ? (s.days < 0 ? daysAgo(-s.days, s.hour!) : daysAhead(s.days, s.hour!)) : new Date(Date.now() + s.hoursAgo! * 3600 * 1000);
    const data = {
      experimentId: experiments[s.experimentIdx].id,
      labId: s.lab.id,
      instructorId: instructor.id,
      scheduledAt,
      durationMin: s.durationMin,
      status: s.status,
      room: s.room,
      remarks: s.remarks,
    };
    sessions.push(
      existing
        ? await db.labSession.update({ where: { id: existing.id }, data })
        : await db.labSession.create({ data: { organizationId: orgId, title: s.title, ...data } })
    );
  }

  // ---- Attendance ----
  const attendanceSpecs = [
    { sessionIdx: 0, user: student, studentName: student.name, status: "PRESENT" },
    { sessionIdx: 0, user: student2, studentName: student2.name, status: "LATE" },
    { sessionIdx: 0, user: null, studentName: "Rohit Kulkarni", status: "ABSENT" },
    { sessionIdx: 3, user: student, studentName: student.name, status: "PRESENT" },
    { sessionIdx: 3, user: student2, studentName: student2.name, status: "PRESENT" },
  ];
  for (const a of attendanceSpecs) {
    const session = sessions[a.sessionIdx];
    const existing = await db.attendance.findFirst({
      where: { organizationId: orgId, sessionId: session.id, studentName: a.studentName },
    });
    const data = {
      sessionId: session.id,
      userId: a.user?.id ?? null,
      status: a.status,
      markedAt: session.scheduledAt,
    };
    if (existing) {
      await db.attendance.update({ where: { id: existing.id }, data });
    } else {
      await db.attendance.create({
        data: { organizationId: orgId, studentName: a.studentName, ...data },
      });
    }
  }

  // ---- Grades (2) ----
  const gradeSpecs = [
    { sessionIdx: 0, studentName: student.name, user: student, score: 87, remarks: "Excellent slide preparation and reporting." },
    { sessionIdx: 0, studentName: student2.name, user: student2, score: 74, remarks: "Needs practice on decolorization timing." },
  ];
  for (const g of gradeSpecs) {
    const session = sessions[g.sessionIdx];
    const existing = await db.grade.findFirst({
      where: { organizationId: orgId, sessionId: session.id, studentName: g.studentName },
    });
    const data = {
      sessionId: session.id,
      experimentId: session.experimentId,
      userId: g.user?.id ?? null,
      score: g.score,
      maxScore: 100,
      remarks: g.remarks,
      gradedById: instructor.id,
    };
    if (existing) {
      await db.grade.update({ where: { id: existing.id }, data });
    } else {
      await db.grade.create({ data: { organizationId: orgId, studentName: g.studentName, ...data } });
    }
  }

  // ---- Incidents (5) ----
  const incidentSpecs = [
    { lab: bio, reportedBy: manager, type: "SAFETY_VIOLATION", title: "Unattended BSC sash left open overnight", description: "Biosafety cabinet found with sash fully open and UV lamp interlocked off after hours.", severity: "CRITICAL", status: "OPEN", days: -1, hour: 8 },
    { lab: bio, reportedBy: student, type: "SPILL", title: "Ethanol spill near staining bench", description: "Approx 50mL ethanol spilled while decanting. Absorbent pads used, area ventilated.", severity: "MEDIUM", status: "INVESTIGATING", days: -2, hour: 15 },
    { lab: mwl, reportedBy: technician, type: "EQUIPMENT_DAMAGE", title: "CNC spindle guard cracked during job", description: "Polycarbonate guard cracked by workpiece slip. Machine tagged out pending WO-2601.", severity: "HIGH", status: "CONTAINED", days: -3, hour: 11, contained: true },
    { lab: ecl, reportedBy: student2, type: "INJURY", title: "Minor solder burn during EC-205 session", description: "Student contacted hot soldering tip. First aid administered on site; no medical referral needed.", severity: "HIGH", status: "RESOLVED", days: -9, hour: 14, resolved: true, rootCause: "Improper tip placement while reaching across the bench.", correctiveAction: "Immediate first aid; bench re-organized to keep cable routing clear.", preventiveAction: "Mandatory soldering safety refresher added to EC-205 week 1." },
    { lab: opl, reportedBy: instructor, type: "MISSING_ASSET", title: "Lens cleaning kit missing from OPL-401", description: "Optics cleaning kit not returned to store after outreach event. QR sweep shows no checkout.", severity: "MEDIUM", status: "CLOSED", days: -21, hour: 17, contained: true, resolved: true, closed: true, rootCause: "Kit signed out informally during outreach event without a checkout record.", correctiveAction: "Kit located in outreach storage locker during quarterly count.", preventiveAction: "All optics accessories must be checked out via QR before leaving the lab; closure reviewed by lab manager.", closureNotes: "Closed after asset recovery and process update confirmed by manager." },
  ];
  for (const i of incidentSpecs) {
    const existing = await db.incident.findFirst({ where: { organizationId: orgId, title: i.title } });
    const occurredAt = daysAgo(-i.days, i.hour);
    const data = {
      labId: i.lab.id,
      reportedById: i.reportedBy.id,
      type: i.type,
      description: i.description,
      severity: i.severity,
      status: i.status,
      occurredAt,
      containedAt: i.contained ? new Date(occurredAt.getTime() + 3 * 3600 * 1000) : null,
      resolvedAt: i.resolved ? new Date(occurredAt.getTime() + 48 * 3600 * 1000) : null,
      closedAt: i.closed ? new Date(occurredAt.getTime() + 120 * 3600 * 1000) : null,
      rootCause: i.rootCause ?? null,
      correctiveAction: i.correctiveAction ?? null,
      preventiveAction: i.preventiveAction ?? null,
      closureNotes: i.closureNotes ?? null,
    };
    if (existing) {
      await db.incident.update({ where: { id: existing.id }, data });
    } else {
      await db.incident.create({ data: { organizationId: orgId, title: i.title, ...data } });
    }
  }

  // ---- Notifications (6) ----
  const notificationSpecs = [
    { userId: admin.id, title: "Purchase request PR-2026-004 approved", body: "Ball bearing restock (₹5,600) approved by lab manager.", type: "SUCCESS", entityType: "PurchaseRequest", entityId: purchaseRequests[3].id },
    { userId: manager.id, title: "Checkout overdue: DC Power Supply 30V/5A", body: "Dev Mehta is 2 days past the due date on EQ-ECL-03.", type: "WARNING", entityType: "Checkout", entityId: overdueCheckout.id },
    { userId: technician.id, title: "New work order assigned to you", body: "WO-2604 Autoclave quarterly validation is scheduled in 3 days.", type: "INFO", entityType: "MaintenanceRecord", entityId: assignedWO.id },
    { userId: student.id, title: "Your reservation was approved", body: "Centrifuge 15000 RPM approved for tomorrow 09:00.", type: "SUCCESS", entityType: "Reservation", entityId: approvedReservation.id },
    { userId: manager.id, title: "Low stock: reorder suggested", body: `${lowStockItem.name} (${lowStockItem.sku}) is below its reorder level.`, type: "WARNING", entityType: "InventoryItem", entityId: lowStockItem.id },
    { userId: admin.id, title: "Chemical expired: Buffer Solution pH 7", body: "BIO-301 buffer stock expired — dispose per safety protocol.", type: "ERROR", entityType: "Chemical", entityId: expiredChemical.id },
  ];
  for (const n of notificationSpecs) {
    const existing = await db.notification.findFirst({
      where: { organizationId: orgId, title: n.title },
    });
    if (!existing) {
      await db.notification.create({ data: { organizationId: orgId, ...n } });
    }
  }

  // ---- Audit logs (6) ----
  const auditSpecs = [
    { userId: admin.id, action: "ORG_CONFIGURED", entityType: "Organization", entityId: orgId, metadata: { plan: "ENTERPRISE", name: org.name }, days: 90 },
    { userId: manager.id, action: "LAB_PROVISIONED", entityType: "Lab", entityId: ecl.id, metadata: { code: "ECL-101", capacity: 40 }, days: 80 },
    { userId: admin.id, action: "EQUIPMENT_REGISTERED", entityType: "Equipment", entityId: eq("EQ-CSL-01").id, metadata: { code: "EQ-CSL-01", price: 320000 }, days: 60 },
    { userId: technician.id, action: "INVENTORY_TX", entityType: "InventoryItem", entityId: lowStockItem.id, metadata: { type: "RECEIPT", sku: lowStockItem.sku }, days: 20 },
    { userId: student.id, action: "RESERVATION_CREATED", entityType: "Reservation", entityId: approvedReservation.id, metadata: { purpose: approvedReservation.purpose }, days: 3 },
    { userId: manager.id, action: "MAINTENANCE_ASSIGNED", entityType: "MaintenanceRecord", entityId: criticalWO.id, metadata: { priority: "CRITICAL", status: "IN_PROGRESS" }, days: 2 },
  ];
  for (const a of auditSpecs) {
    const existing = await db.auditLog.findFirst({
      where: { organizationId: orgId, action: a.action, entityType: a.entityType },
    });
    if (!existing) {
      await db.auditLog.create({
        data: {
          organizationId: orgId,
          userId: a.userId,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          metadata: JSON.stringify(a.metadata),
          createdAt: daysAgo(a.days, 13),
        },
      });
    }
  }

  // ---- Summary ----
  const counts = {
    departments: await db.department.count({ where: { organizationId: orgId } }),
    labs: await db.lab.count({ where: { organizationId: orgId } }),
    users: await db.user.count({ where: { organizationId: orgId } }),
    courses: await db.course.count({ where: { organizationId: orgId } }),
    equipment: await db.equipment.count({ where: { organizationId: orgId } }),
    equipmentEvents: await db.equipmentEvent.count({ where: { organizationId: orgId } }),
    inventoryItems: await db.inventoryItem.count({ where: { organizationId: orgId } }),
    inventoryTransactions: await db.inventoryTransaction.count({ where: { organizationId: orgId } }),
    chemicals: await db.chemical.count({ where: { organizationId: orgId } }),
    maintenance: await db.maintenanceRecord.count({ where: { organizationId: orgId } }),
    calibrations: await db.calibrationRecord.count({ where: { organizationId: orgId } }),
    reservations: await db.reservation.count({ where: { organizationId: orgId } }),
    checkouts: await db.checkout.count({ where: { organizationId: orgId } }),
    incidents: await db.incident.count({ where: { organizationId: orgId } }),
    vendors: await db.vendor.count({ where: { organizationId: orgId } }),
    purchaseRequests: await db.purchaseRequest.count({ where: { organizationId: orgId } }),
    purchaseOrders: await db.purchaseOrder.count({ where: { organizationId: orgId } }),
    goodsReceipts: await db.goodsReceipt.count({ where: { organizationId: orgId } }),
    experiments: await db.experiment.count({ where: { organizationId: orgId } }),
    sessions: await db.labSession.count({ where: { organizationId: orgId } }),
    attendance: await db.attendance.count({ where: { organizationId: orgId } }),
    grades: await db.grade.count({ where: { organizationId: orgId } }),
    notifications: await db.notification.count({ where: { organizationId: orgId } }),
    auditLogs: await db.auditLog.count({ where: { organizationId: orgId } }),
  };
  console.log("Seed complete (idempotent per-entity).");
  console.log(JSON.stringify(counts, null, 2));
  console.log("Organization: Northstar Institute of Technology (nova-labs, ENTERPRISE)");
  console.log("Logins (password: Password@123): admin/manager/instructor/tech/student/student2 @labvault.io");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
