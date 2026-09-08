/**
 * Seed script — run with: bun prisma/seed.ts
 * Idempotent: skips if the demo organization already exists.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEMO_PASSWORD = "Password@123";

function daysFromNow(days: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const existing = await db.organization.findUnique({ where: { slug: "nova-labs" } });
  if (existing) {
    console.log("Seed skipped — organization 'nova-labs' already exists.");
    return;
  }

  console.log("Seeding LabVault demo data…");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const org = await db.organization.create({
    data: { name: "Nova Institute of Technology", slug: "nova-labs", plan: "ENTERPRISE" },
  });
  const orgId = org.id;

  const users = await Promise.all(
    [
      { name: "Aarav Sharma", email: "admin@labvault.io", role: "ADMIN", department: "Administration" },
      { name: "Shyamali Samant", email: "manager@labvault.io", role: "LAB_MANAGER", department: "Lab Operations" },
      { name: "Kaif Kenwey", email: "instructor@labvault.io", role: "INSTRUCTOR", department: "Electronics" },
      { name: "Ravi Verma", email: "tech@labvault.io", role: "TECHNICIAN", department: "Maintenance" },
      { name: "Priya Nair", email: "student@labvault.io", role: "STUDENT", department: "Computer Science" },
      { name: "Dev Mehta", email: "student2@labvault.io", role: "STUDENT", department: "Electronics" },
    ].map((u) =>
      db.user.create({ data: { ...u, organizationId: orgId, passwordHash } })
    )
  );
  const [admin, manager, instructor, technician, student, student2] = users;

  const labs = await Promise.all(
    [
      { name: "Electronics & Circuits Lab", code: "ECL-101", location: "Block A · Floor 1", capacity: 40, description: "Analog/digital circuit design, oscilloscopes, soldering stations." },
      { name: "Computer Systems Lab", code: "CSL-201", location: "Block B · Floor 2", capacity: 60, description: "High-performance workstations for OS, networks and AI coursework." },
      { name: "Chemistry Analysis Lab", code: "CAL-301", location: "Block C · Floor 3", capacity: 30, description: "Wet-lab analysis with fume hoods and chemical storage." },
      { name: "Optics & Photonics Lab", code: "OPL-401", location: "Block D · Floor 1", capacity: 20, description: "Laser optics benches, spectrometers and dark room." },
    ].map((l) =>
      db.lab.create({
        data: { ...l, organizationId: orgId, managerId: manager.id, status: "ACTIVE" },
      })
    )
  );
  const [ecl, csl, cal, opl] = labs;

  const equipmentData = [
    { lab: ecl, name: "Digital Oscilloscope 200MHz", code: "EQ-OSC-001", category: "INSTRUMENT", manufacturer: "Rigol", price: 120000, condition: "EXCELLENT", status: "AVAILABLE" },
    { lab: ecl, name: "Function Generator 25MHz", code: "EQ-FG-002", category: "INSTRUMENT", manufacturer: "Siglent", price: 45000, condition: "GOOD", status: "AVAILABLE" },
    { lab: ecl, name: "DC Power Supply 30V/5A", code: "EQ-PS-003", category: "ELECTRICAL", manufacturer: "Keysight", price: 62000, condition: "GOOD", status: "IN_USE" },
    { lab: ecl, name: "Soldering Station Duo", code: "EQ-SOL-004", category: "GENERAL", manufacturer: "Weller", price: 18000, condition: "FAIR", status: "AVAILABLE" },
    { lab: csl, name: "GPU Workstation RTX 4090", code: "EQ-GPU-005", category: "COMPUTING", manufacturer: "NVIDIA", price: 320000, condition: "EXCELLENT", status: "IN_USE" },
    { lab: csl, name: "Network Packet Simulator", code: "EQ-NET-006", category: "COMPUTING", manufacturer: "Cisco", price: 210000, condition: "GOOD", status: "AVAILABLE" },
    { lab: csl, name: "3D Printer Prusa MK4", code: "EQ-3DP-007", category: "GENERAL", manufacturer: "Prusa", price: 85000, condition: "GOOD", status: "UNDER_MAINTENANCE" },
    { lab: cal, name: "UV-Vis Spectrophotometer", code: "EQ-UVS-008", category: "INSTRUMENT", manufacturer: "Shimadzu", price: 480000, condition: "EXCELLENT", status: "AVAILABLE" },
    { lab: cal, name: "pH Meter Benchtop", code: "EQ-PHM-009", category: "INSTRUMENT", manufacturer: "Mettler Toledo", price: 35000, condition: "GOOD", status: "AVAILABLE" },
    { lab: cal, name: "Centrifuge 15000 RPM", code: "EQ-CEN-010", category: "INSTRUMENT", manufacturer: "Eppendorf", price: 190000, condition: "GOOD", status: "AVAILABLE" },
    { lab: cal, name: "Fume Hood Station A", code: "EQ-FH-011", category: "SAFETY", manufacturer: "Labconco", price: 250000, condition: "FAIR", status: "AVAILABLE" },
    { lab: opl, name: "He-Ne Laser 632nm", code: "EQ-LSR-012", category: "OPTICS", manufacturer: "Thorlabs", price: 150000, condition: "EXCELLENT", status: "AVAILABLE" },
    { lab: opl, name: "Optical Table 4ft", code: "EQ-OPT-013", category: "OPTICS", manufacturer: "Newport", price: 380000, condition: "GOOD", status: "AVAILABLE" },
    { lab: opl, name: "Fiber Optic Kit Pro", code: "EQ-FOK-014", category: "OPTICS", manufacturer: "Thorlabs", price: 95000, condition: "GOOD", status: "RETIRED" },
  ];
  const equipment = await Promise.all(
    equipmentData.map((e) =>
      db.equipment.create({
        data: {
          organizationId: orgId,
          labId: e.lab.id,
          name: e.name,
          code: e.code,
          category: e.category,
          status: e.status,
          condition: e.condition,
          manufacturer: e.manufacturer,
          purchaseDate: daysFromNow(-400 - Math.floor(Math.random() * 500)),
          price: e.price,
        },
      })
    )
  );

  await Promise.all([
    db.reservation.createMany({
      data: [
        { organizationId: orgId, equipmentId: equipment[0].id, userId: student.id, startAt: daysFromNow(1, 9), endAt: daysFromNow(1, 12), status: "APPROVED", purpose: "Signals lab experiment 4" },
        { organizationId: orgId, equipmentId: equipment[7].id, userId: student2.id, startAt: daysFromNow(2, 14), endAt: daysFromNow(2, 17), status: "PENDING", purpose: "Absorbance spectroscopy of samples" },
        { organizationId: orgId, equipmentId: equipment[4].id, userId: student.id, startAt: daysFromNow(3, 10), endAt: daysFromNow(3, 16), status: "PENDING", purpose: "CNN training run" },
        { organizationId: orgId, equipmentId: equipment[11].id, userId: student2.id, startAt: daysFromNow(-5, 9), endAt: daysFromNow(-5, 12), status: "COMPLETED", purpose: "Interference patterns" },
        { organizationId: orgId, equipmentId: equipment[1].id, userId: student.id, startAt: daysFromNow(-2, 10), endAt: daysFromNow(-2, 12), status: "COMPLETED", purpose: "Waveform generation practice" },
      ],
    }),
    db.checkout.createMany({
      data: [
        { organizationId: orgId, equipmentId: equipment[2].id, userId: student.id, checkedOutAt: daysFromNow(-3), dueAt: daysFromNow(2), status: "ACTIVE", conditionOut: "GOOD" },
        { organizationId: orgId, equipmentId: equipment[3].id, userId: student2.id, checkedOutAt: daysFromNow(-10), dueAt: daysFromNow(-2), status: "OVERDUE", conditionOut: "FAIR" },
        { organizationId: orgId, equipmentId: equipment[8].id, userId: student.id, checkedOutAt: daysFromNow(-20), dueAt: daysFromNow(-13), checkedInAt: daysFromNow(-13), status: "RETURNED", conditionOut: "GOOD", conditionIn: "GOOD" },
      ],
    }),
    db.inventoryItem.createMany({
      data: [
        { organizationId: orgId, labId: ecl.id, name: "Breadboard 830pt", sku: "INV-BB-001", category: "CONSUMABLE", quantity: 45, unit: "pcs", minQuantity: 15, location: "Cabinet A2" },
        { organizationId: orgId, labId: ecl.id, name: "Jumper Wire Kit", sku: "INV-JW-002", category: "CONSUMABLE", quantity: 8, unit: "kits", minQuantity: 10, location: "Cabinet A3" },
        { organizationId: orgId, labId: ecl.id, name: "Resistor Assortment 500pc", sku: "INV-RS-003", category: "CONSUMABLE", quantity: 22, unit: "boxes", minQuantity: 5, location: "Drawer B1" },
        { organizationId: orgId, labId: csl.id, name: "Cat6 Patch Cable 2m", sku: "INV-C6-004", category: "SPARE", quantity: 60, unit: "pcs", minQuantity: 20, location: "Rack C1" },
        { organizationId: orgId, labId: csl.id, name: "PLA Filament 1kg", sku: "INV-PLA-005", category: "CONSUMABLE", quantity: 4, unit: "spools", minQuantity: 5, location: "Shelf D2" },
        { organizationId: orgId, labId: cal.id, name: "Nitrile Gloves (M)", sku: "INV-NG-006", category: "SAFETY", quantity: 12, unit: "boxes", minQuantity: 10, location: "Safety Cabinet" },
        { organizationId: orgId, labId: cal.id, name: "Beaker Set 250mL", sku: "INV-BK-007", category: "CONSUMABLE", quantity: 36, unit: "sets", minQuantity: 12, location: "Glassware Room" },
        { organizationId: orgId, labId: opl.id, name: "Lens Cleaning Kit", sku: "INV-LC-008", category: "CONSUMABLE", quantity: 9, unit: "kits", minQuantity: 4, location: "Optics Store" },
      ],
    }),
    db.chemical.createMany({
      data: [
        { organizationId: orgId, labId: cal.id, name: "Sodium Hydroxide 1M", casNumber: "1310-73-2", quantity: 2500, unit: "mL", hazardClass: "CORROSIVE", expiryDate: daysFromNow(210), storageLocation: "Base Cabinet" },
        { organizationId: orgId, labId: cal.id, name: "Ethanol 99.9%", casNumber: "64-17-5", quantity: 4000, unit: "mL", hazardClass: "FLAMMABLE", expiryDate: daysFromNow(400), storageLocation: "Flammables Safe" },
        { organizationId: orgId, labId: cal.id, name: "Hydrochloric Acid 37%", casNumber: "7647-01-0", quantity: 1200, unit: "mL", hazardClass: "CORROSIVE", expiryDate: daysFromNow(30), storageLocation: "Acid Cabinet" },
        { organizationId: orgId, labId: cal.id, name: "Methanol", casNumber: "67-56-1", quantity: 800, unit: "mL", hazardClass: "TOXIC", expiryDate: daysFromNow(150), storageLocation: "Flammables Safe" },
        { organizationId: orgId, labId: cal.id, name: "Buffer Solution pH 7", casNumber: null, quantity: 3000, unit: "mL", hazardClass: "LOW", expiryDate: daysFromNow(-10), storageLocation: "Shelf E1" },
      ],
    }),
    db.maintenanceRecord.createMany({
      data: [
        { organizationId: orgId, equipmentId: equipment[6].id, technicianId: technician.id, type: "CORRECTIVE", status: "IN_PROGRESS", scheduledAt: daysFromNow(-1), cost: 3500, notes: "Extruder nozzle replacement and bed leveling." },
        { organizationId: orgId, equipmentId: equipment[0].id, technicianId: technician.id, type: "CALIBRATION", status: "SCHEDULED", scheduledAt: daysFromNow(7), cost: 2000, notes: "Quarterly probe compensation." },
        { organizationId: orgId, equipmentId: equipment[10].id, technicianId: technician.id, type: "PREVENTIVE", status: "COMPLETED", scheduledAt: daysFromNow(-14), completedAt: daysFromNow(-14), cost: 5000, notes: "Airflow velocity test passed." },
        { organizationId: orgId, equipmentId: equipment[13].id, technicianId: technician.id, type: "CORRECTIVE", status: "SCHEDULED", scheduledAt: daysFromNow(3), cost: 12000, notes: "Fiber connector damage assessment." },
      ],
    }),
  ]);

  const experiments = await Promise.all([
    db.experiment.create({ data: { organizationId: orgId, labId: ecl.id, instructorId: instructor.id, title: "RC Circuit Transient Response", code: "EXP-EC-01", description: "Measure charging/discharging of RC networks.", status: "ACTIVE" } }),
    db.experiment.create({ data: { organizationId: orgId, labId: csl.id, instructorId: instructor.id, title: "TCP Congestion Control Analysis", code: "EXP-CS-02", description: "Compare Reno vs CUBIC under packet loss.", status: "ACTIVE" } }),
    db.experiment.create({ data: { organizationId: orgId, labId: cal.id, instructorId: instructor.id, title: "Acid-Base Titration Curves", code: "EXP-CH-03", description: "Strong/weak acid titration with pH probe.", status: "ACTIVE" } }),
    db.experiment.create({ data: { organizationId: orgId, labId: opl.id, instructorId: instructor.id, title: "Double-Slit Interference", code: "EXP-OP-04", description: "Laser wavelength estimation via fringe spacing.", status: "DRAFT" } }),
  ]);

  const sessions = await Promise.all([
    db.labSession.create({ data: { organizationId: orgId, experimentId: experiments[0].id, labId: ecl.id, instructorId: instructor.id, title: "RC Circuit — Batch A", scheduledAt: daysFromNow(1, 9), durationMin: 120, status: "SCHEDULED", room: "ECL-101" } }),
    db.labSession.create({ data: { organizationId: orgId, experimentId: experiments[1].id, labId: csl.id, instructorId: instructor.id, title: "TCP Analysis — Batch A", scheduledAt: daysFromNow(2, 11), durationMin: 90, status: "SCHEDULED", room: "CSL-201" } }),
    db.labSession.create({ data: { organizationId: orgId, experimentId: experiments[2].id, labId: cal.id, instructorId: instructor.id, title: "Titration — Batch B", scheduledAt: daysFromNow(-3, 14), durationMin: 90, status: "COMPLETED", room: "CAL-301" } }),
  ]);

  await db.attendance.createMany({
    data: [
      { organizationId: orgId, sessionId: sessions[2].id, userId: student.id, studentName: student.name, status: "PRESENT", markedAt: sessions[2].scheduledAt },
      { organizationId: orgId, sessionId: sessions[2].id, userId: student2.id, studentName: student2.name, status: "LATE", markedAt: sessions[2].scheduledAt },
      { organizationId: orgId, sessionId: sessions[2].id, studentName: "Guest Observer", status: "ABSENT", markedAt: sessions[2].scheduledAt },
    ],
  });

  await Promise.all([
    db.incident.createMany({
      data: [
        { organizationId: orgId, labId: cal.id, reportedById: instructor.id, title: "Minor acid spill on bench 4", description: "HCl drip during transfer. Neutralized and cleaned. No injuries.", severity: "MEDIUM", status: "INVESTIGATING", occurredAt: daysFromNow(-2, 15) },
        { organizationId: orgId, labId: ecl.id, reportedById: student.id, title: "Oscilloscope probe tip broken", description: "Probe dropped during session. Replacement needed.", severity: "LOW", status: "RESOLVED", occurredAt: daysFromNow(-8, 11) },
        { organizationId: orgId, labId: csl.id, reportedById: manager.id, title: "UPS battery warning in server rack", description: "Battery backup beeping, needs replacement within a week.", severity: "HIGH", status: "OPEN", occurredAt: daysFromNow(0, 9) },
      ],
    }),
    db.vendor.createMany({
      data: [
        { organizationId: orgId, name: "Scientific Instruments Co.", contactEmail: "sales@scico.example", phone: "+91 98200 11223", address: "Andheri East, Mumbai", category: "EQUIPMENT", rating: 4.6 },
        { organizationId: orgId, name: "ChemSupply India", contactEmail: "orders@chemsupply.example", phone: "+91 98111 44556", address: "Vashi, Navi Mumbai", category: "CHEMICALS", rating: 4.2 },
        { organizationId: orgId, name: "LabConsumables Direct", contactEmail: "hello@labdirect.example", phone: "+91 99887 66554", address: "Whitefield, Bengaluru", category: "CONSUMABLES", rating: 3.9 },
      ],
    }),
  ]);

  const vendors = await db.vendor.findMany({ where: { organizationId: orgId } });
  await db.purchaseRequest.createMany({
    data: [
      { organizationId: orgId, vendorId: vendors[1].id, requestedById: manager.id, itemName: "Hydrochloric Acid 37% (5L)", quantity: 4, estimatedCost: 8600, status: "APPROVED", justification: "Stock below minimum after titration batch." },
      { organizationId: orgId, vendorId: vendors[0].id, requestedById: instructor.id, itemName: "Digital Oscilloscope 100MHz", quantity: 2, estimatedCost: 96000, status: "SUBMITTED", justification: "Second batch needs parallel stations." },
      { organizationId: orgId, vendorId: vendors[2].id, requestedById: manager.id, itemName: "Jumper Wire Kit", quantity: 20, estimatedCost: 14000, status: "ORDERED", justification: "Below min quantity." },
      { organizationId: orgId, vendorId: vendors[0].id, requestedById: technician.id, itemName: "3D Printer Nozzle Set", quantity: 3, estimatedCost: 4200, status: "RECEIVED", justification: "Maintenance spares." },
    ],
  });

  await db.notification.createMany({
    data: [
      { organizationId: orgId, userId: admin.id, title: "Purchase request approved", body: "HCl restock (₹8,600) was approved by the lab manager.", type: "SUCCESS" },
      { organizationId: orgId, userId: manager.id, title: "Equipment overdue", body: "Soldering Station Duo is 2 days overdue from Dev Mehta.", type: "WARNING" },
      { organizationId: orgId, userId: instructor.id, title: "Session tomorrow", body: "RC Circuit — Batch A starts tomorrow 09:00 in ECL-101.", type: "INFO" },
      { organizationId: orgId, userId: admin.id, title: "Chemical expiring soon", body: "Buffer Solution pH 7 expired. Dispose per safety protocol.", type: "ERROR" },
    ],
  });

  await db.auditLog.createMany({
    data: [
      { organizationId: orgId, userId: admin.id, action: "ORG_CREATED", entityType: "Organization", entityId: orgId, metadata: JSON.stringify({ name: org.name }) },
      { organizationId: orgId, userId: manager.id, action: "LAB_CREATED", entityType: "Lab", entityId: ecl.id, metadata: JSON.stringify({ code: "ECL-101" }) },
      { organizationId: orgId, userId: admin.id, action: "USER_INVITED", entityType: "User", metadata: JSON.stringify({ role: "STUDENT", count: 2 }) },
      { organizationId: orgId, userId: instructor.id, action: "EXPERIMENT_CREATED", entityType: "Experiment", metadata: JSON.stringify({ code: "EXP-EC-01" }) },
      { organizationId: orgId, userId: manager.id, action: "PURCHASE_APPROVED", entityType: "PurchaseRequest", metadata: JSON.stringify({ item: "Hydrochloric Acid 37% (5L)" }) },
    ],
  });

  console.log("✅ Seed complete!");
  console.log("   Organization: Nova Institute of Technology (nova-labs)");
  console.log("   Logins (password: Password@123):");
  console.log("   • admin@labvault.io      (ADMIN)");
  console.log("   • manager@labvault.io    (LAB_MANAGER)");
  console.log("   • instructor@labvault.io (INSTRUCTOR)");
  console.log("   • tech@labvault.io       (TECHNICIAN)");
  console.log("   • student@labvault.io    (STUDENT)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
