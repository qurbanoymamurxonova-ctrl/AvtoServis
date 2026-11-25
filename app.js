const STORAGE_KEY = "avtoservis_data";

const state = {
  cars: [],
  services: [],
  activeFilter: "all",
  role: localStorage.getItem("avtoservis_role") || "haydovchi"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function uid() {
  return `${Date.now()}${Math.random().toString(16).slice(2)}`;
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    state.cars = data.cars || [];
    state.services = data.services || [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    cars: state.cars,
    services: state.services
  }));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function formatMoney(value) {
  return new Intl.NumberFormat("uz-UZ").format(Number(value || 0)) + " so'm";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getCar(carId) {
  return state.cars.find((car) => car.id === carId);
}

function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.ceil((end - start) / 86400000);
}

function getReminderStatus(nextDate) {
  const today = new Date();
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const days = daysBetween(current, nextDate);
  if (days < 0) return { type: "overdue", label: `${Math.abs(days)} kun kechikkan` };
  if (days === 0) return { type: "upcoming", label: "Bugun" };
  if (days <= 30) return { type: "upcoming", label: `${days} kundan so'ng` };
  return { type: "later", label: `${days} kun qoldi` };
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function exportServiceHistory(carId) {
  const car = getCar(carId);
  if (!car) return;

  const services = state.services
    .filter((service) => service.carId === carId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const rows = services.length ? services.map((service) => `
    <tr>
      <td>${formatDate(service.date)} ${escapeHtml(service.time || "")}</td>
      <td>${escapeHtml(service.type)}</td>
      <td>${new Intl.NumberFormat("uz-UZ").format(service.mileage)} km</td>
      <td>${escapeHtml(service.parts || "-")}</td>
      <td>${escapeHtml(service.mechanic || "-")}</td>
      <td>${escapeHtml(service.note || "-")}</td>
      <td>${formatMoney(service.cost)}</td>
      <td>${formatDate(service.nextDate)}</td>
    </tr>`).join("") : '<tr><td colspan="8" style="text-align:center">Xizmat tarixi mavjud emas</td></tr>';

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("PDF uchun oynalarni ochishga ruxsat bering");
    return;
  }

  printWindow.document.write(`<!doctype html>
    <html lang="uz"><head><meta charset="UTF-8"><title>${escapeHtml(car.plate)} - xizmat tarixi</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1d2a44; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      .meta { margin-bottom: 22px; color: #59657a; line-height: 1.7; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #edf3ff; }
      th, td { border: 1px solid #dfe5ee; padding: 8px; text-align: left; vertical-align: top; }
      @media print { body { padding: 0; } }
    </style></head><body>
      <h1>Avtomobilning to‘liq xizmat tarixi</h1>
      <div class="meta">
        <strong>Avtomobil:</strong> ${escapeHtml(car.model)}<br>
        <strong>Davlat raqami:</strong> ${escapeHtml(car.plate)}<br>
        <strong>Egasi:</strong> ${escapeHtml(car.owner)} | <strong>Telefon:</strong> ${escapeHtml(car.phone)}<br>
        <strong>Yili:</strong> ${escapeHtml(car.year)} | <strong>VIN:</strong> ${escapeHtml(car.vin || "-")}
      </div>
      <table>
        <thead><tr><th>Sana / vaqt</th><th>Xizmat</th><th>Probeg</th><th>Ehtiyot qismlar</th><th>Mexanik</th><th>Izoh</th><th>Narx</th><th>Keyingi xizmat</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

function sendServiceNotifications() {
  if (!("Notification" in window)) return;
  const today = new Date();
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  state.services.forEach((service) => {
    const days = daysBetween(current, service.nextDate);
    if (days < 0 || days > 30) return;
    const car = getCar(service.carId);
    const key = `${service.id}-${service.nextDate}`;
    if (localStorage.getItem(`notified:${key}`)) return;

    new Notification("AvtoServis - yaqinlashayotgan xizmat", {
      body: `${car?.model || "Avtomobil"} (${car?.plate || "-"}) - ${service.type}. Muddat: ${formatDate(service.nextDate)}`
    });
    localStorage.setItem(`notified:${key}`, "1");
  });
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Brauzer tizim eslatmalarini qo‘llab-quvvatlamaydi");
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission === "granted") {
    showToast("Xizmat eslatmalari yoqildi");
    sendServiceNotifications();
  } else {
    showToast("Brauzer eslatmalarga ruxsat bermadi");
  }
}

function switchView(viewName) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#${viewName}-view`).classList.add("active");
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewName));

  const titles = {
    dashboard: ["Boshqaruv paneli", "Xayrli kun"],
    cars: ["Avtomobil bazasi", "Avtomobillar"],
    services: ["Xizmat tarixi", "Servis yozuvlari"],
    reminders: ["Rejalashtirish", "Keyingi xizmat eslatmalari"]
  };
  $("#page-eyebrow").textContent = titles[viewName][0];
  $("#page-title").textContent = titles[viewName][1];
}

function renderStats() {
  const today = new Date();
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const overdue = state.services.filter((service) => daysBetween(current, service.nextDate) < 0).length;
  const upcoming = state.services.filter((service) => {
    const days = daysBetween(current, service.nextDate);
    return days >= 0 && days <= 30;
  }).length;

  $("#total-cars").textContent = state.cars.length;
  $("#total-services").textContent = state.services.length;
  $("#total-reminders").textContent = upcoming;
  $("#overdue-count").textContent = overdue;
}

function renderUpcoming() {
  const today = new Date();
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const items = state.services
    .filter((service) => daysBetween(current, service.nextDate) <= 30)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .slice(0, 5);

  if (!items.length) {
    $("#upcoming-list").innerHTML = '<div class="empty">Yaqinlashayotgan xizmatlar yo‘q</div>';
    return;
  }

  $("#upcoming-list").innerHTML = items.map((service) => {
    const car = getCar(service.carId);
    const status = getReminderStatus(service.nextDate);
    return `
      <div class="reminder-row">
        <div class="row-icon">◆</div>
        <div class="row-main">
          <strong>${escapeHtml(car?.model || "O‘chirilgan avtomobil")}</strong>
          <span>${escapeHtml(service.type)} - ${formatDate(service.nextDate)}</span>
        </div>
        <span class="due-badge ${status.type === "overdue" ? "overdue" : ""}">${status.label}</span>
      </div>`;
  }).join("");
}

function renderRecentServices() {
  const items = [...state.services]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  if (!items.length) {
    $("#recent-services").innerHTML = '<div class="empty">Hali xizmat yozuvlari yo‘q</div>';
    return;
  }

  $("#recent-services").innerHTML = items.map((service) => {
    const car = getCar(service.carId);
    return `
      <div class="activity-row">
        <div class="row-icon">✓</div>
        <div class="row-main">
          <strong>${escapeHtml(service.type)}</strong>
          <span>${escapeHtml(car?.model || "O‘chirilgan avtomobil")} · ${formatDate(service.date)}</span>
        </div>
        <strong style="font-size:12px">${formatMoney(service.cost)}</strong>
      </div>`;
  }).join("");
}

function renderCars(search = "") {
  const term = search.trim().toLowerCase();
  const cars = state.cars.filter((car) =>
    [car.model, car.plate, car.owner, car.phone].join(" ").toLowerCase().includes(term)
  );

  $("#cars-table").innerHTML = cars.length ? cars.map((car) => `
    <tr>
      <td><div class="car-name"><div class="car-avatar">${escapeHtml(car.model.slice(0, 2).toUpperCase())}</div><strong>${escapeHtml(car.model)}</strong></div></td>
      <td><strong>${escapeHtml(car.plate)}</strong></td>
      <td>${escapeHtml(car.owner)}</td>
      <td>${escapeHtml(car.phone)}</td>
      <td>${escapeHtml(car.year)}</td>
      <td class="actions-col">
        <button class="icon-action" title="Xizmat tarixini PDF qilib chiqarish" data-export-car="${car.id}">⇩</button>
        <button class="icon-action" title="Tahrirlash" data-edit-car="${car.id}">✎</button>
        <button class="icon-action delete" title="O‘chirish" data-delete-car="${car.id}">⌫</button>
      </td>
    </tr>
  `).join("") : '<tr><td colspan="6"><div class="empty">Avtomobillar topilmadi</div></td></tr>';
}

function renderServices(search = "") {
  const term = search.trim().toLowerCase();
  const services = [...state.services]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((service) => {
      const car = getCar(service.carId);
      return [car?.model, car?.plate, service.type].join(" ").toLowerCase().includes(term);
    });

  $("#services-table").innerHTML = services.length ? services.map((service) => {
    const car = getCar(service.carId);
    const status = getReminderStatus(service.nextDate);
    return `
      <tr>
        <td>${formatDate(service.date)}<br><small style="color:#8792a3">${escapeHtml(service.time || "-")}</small></td>
        <td><strong>${escapeHtml(car?.model || "O‘chirilgan avtomobil")}</strong><br><small style="color:#8792a3">${escapeHtml(car?.plate || "-")}</small></td>
        <td>${escapeHtml(service.type)}</td>
        <td>${new Intl.NumberFormat("uz-UZ").format(service.mileage)} km</td>
        <td><span class="due-badge">${escapeHtml(service.status || "Yozilgan")}</span></td>
        <td><strong>${formatMoney(service.estimate || service.cost)}</strong><br><small style="color:#8792a3">${escapeHtml(service.payment || "To‘lanmagan")}</small></td>
        <td>${escapeHtml(service.mechanic || "-")}</td>
        <td><span class="due-badge ${status.type === "overdue" ? "overdue" : ""}">${formatDate(service.nextDate)}</span>${service.nextMileage ? `<br><small style="color:#8792a3">${new Intl.NumberFormat("uz-UZ").format(service.nextMileage)} km</small>` : ""}</td>
        <td class="actions-col">
          <button class="icon-action" title="Tahrirlash" data-edit-service="${service.id}">✎</button>
          <button class="icon-action delete" title="O‘chirish" data-delete-service="${service.id}">⌫</button>
        </td>
      </tr>`;
  }).join("") : '<tr><td colspan="9"><div class="empty">Xizmat yozuvlari topilmadi</div></td></tr>';
}

function renderReminders() {
  const today = new Date();
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let services = [...state.services].sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  if (state.activeFilter === "upcoming") {
    services = services.filter((service) => {
      const days = daysBetween(current, service.nextDate);
      return days >= 0 && days <= 30;
    });
  } else if (state.activeFilter === "overdue") {
    services = services.filter((service) => daysBetween(current, service.nextDate) < 0);
  }

  $("#reminders-grid").innerHTML = services.length ? services.map((service) => {
    const car = getCar(service.carId);
    const status = getReminderStatus(service.nextDate);
    const cardClass = status.type === "overdue" ? "overdue" : status.type === "upcoming" ? "upcoming" : "";
    return `
      <article class="reminder-card ${cardClass}">
        <span class="due-badge ${status.type === "overdue" ? "overdue" : ""}">${status.label}</span>
        <p class="panel-kicker">${escapeHtml(car?.plate || "Avtomobil")}</p>
        <h3>${escapeHtml(car?.model || "O‘chirilgan avtomobil")}</h3>
        <p><strong>${escapeHtml(service.type)}</strong><br>Keyingi xizmat: ${formatDate(service.nextDate)}<br>Egasi: ${escapeHtml(car?.owner || "-")}</p>
      </article>`;
  }).join("") : '<div class="empty">Bu turkumda eslatmalar yo‘q</div>';
}

function refreshAll() {
  renderStats();
  renderUpcoming();
  renderRecentServices();
  renderCars($("#car-search").value);
  renderServices($("#service-search").value);
  renderReminders();
  renderCarOptions();
}

function openModal(id) {
  $(`#${id}`).classList.add("open");
}

function closeModal(id) {
  $(`#${id}`).classList.remove("open");
}

function renderCarOptions(selectedId = "") {
  $("#service-car").innerHTML = state.cars.length
    ? state.cars.map((car) => `<option value="${car.id}" ${car.id === selectedId ? "selected" : ""}>${escapeHtml(car.model)} - ${escapeHtml(car.plate)}</option>`).join("")
    : '<option value="">Avtomobil mavjud emas</option>';
}

function resetCarForm() {
  $("#car-form").reset();
  $("#car-id").value = "";
  $("#car-modal-title").textContent = "Avtomobil qo‘shish";
  $("#car-year").value = new Date().getFullYear();
}

function resetServiceForm() {
  $("#service-form").reset();
  $("#service-id").value = "";
  $("#service-modal-title").textContent = "Yangi servis yozuvi";
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  $("#service-date").value = iso;
  $("#service-time").value = "09:00";
  $("#service-status").value = "Yozilgan";
  $("#service-payment").value = "To‘lanmagan";
  $("#service-duration").value = "2";
  $("#service-estimate-approved").checked = false;
  renderCarOptions();
}

function seedDemoData() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const today = new Date();
  const iso = (offset) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  state.cars = [
    { id: uid(), model: "Chevrolet Cobalt", plate: "01 A 123 BC", owner: "Aziz Karimov", phone: "+998 90 123 45 67", year: "2022", vin: "KL1AB..." },
    { id: uid(), model: "Toyota Camry", plate: "01 B 777 AA", owner: "Dilshod Rahimov", phone: "+998 91 777 77 77", year: "2021", vin: "4T1BF..." },
    { id: uid(), model: "Hyundai Tucson", plate: "10 C 456 DD", owner: "Malika Saidova", phone: "+998 93 456 78 90", year: "2023", vin: "KM8JB..." }
  ];
  state.services = [
    { id: uid(), carId: state.cars[0].id, date: iso(-45), time: "10:30", type: "Moy va filtr almashtirish", mileage: 38500, cost: 450000, estimate: 500000, estimateApproved: true, nextKm: 10000, nextMonths: 6, duration: 2, payment: "To‘liq to‘langan", status: "Bajarildi", mechanic: "Jamshid Karimov", parts: "Motor moyi, havodor filtri", nextDate: iso(12), note: "Motor moyi va havodor filtri almashtirildi" },
    { id: uid(), carId: state.cars[1].id, date: iso(-90), time: "14:00", type: "Tormoz tizimi tekshiruvi", mileage: 62200, cost: 850000, estimate: 900000, payment: "To‘lanmagan", status: "Tasdiqlangan", mechanic: "Bekzod Umarov", parts: "Tormoz kolodkasi", nextDate: iso(-5), note: "Tormoz kolodkalari tekshirildi" },
    { id: uid(), carId: state.cars[2].id, date: iso(-20), time: "09:30", type: "Texnik ko'rik", mileage: 18400, cost: 300000, estimate: 300000, payment: "To‘liq to‘langan", status: "Bajarildi", mechanic: "Sanjar Aliyev", parts: "-", nextDate: iso(25), note: "Umumiy texnik ko'rik" }
  ];
  saveData();
}

$$(".nav-item").forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.view));
});

$$("[data-go]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.go));
});

$("#add-car-btn").addEventListener("click", () => {
  resetCarForm();
  openModal("car-modal");
});

["#add-service-btn", "#add-service-toolbar-btn"].forEach((selector) => {
  $(selector).addEventListener("click", () => {
    resetServiceForm();
    openModal("service-modal");
  });
});

$$("[data-close]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.dataset.close));
});

$$(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.classList.remove("open");
  });
});

$("#car-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#car-id").value;
  const car = {
    id: id || uid(),
    model: $("#car-model").value.trim(),
    plate: $("#car-plate").value.trim(),
    owner: $("#car-owner").value.trim(),
    phone: $("#car-phone").value.trim(),
    year: $("#car-year").value,
    vin: $("#car-vin").value.trim()
  };

  if (id) {
    state.cars = state.cars.map((item) => item.id === id ? car : item);
  } else {
    state.cars.push(car);
  }

  saveData();
  closeModal("car-modal");
  refreshAll();
  showToast(id ? "Avtomobil ma'lumotlari yangilandi" : "Avtomobil qo‘shildi");
});

$("#service-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = $("#service-id").value;
  const service = {
    id: id || uid(),
    carId: $("#service-car").value,
    date: $("#service-date").value,
    time: $("#service-time").value,
    type: $("#service-type").value.trim(),
    mileage: Number($("#service-mileage").value),
    cost: Number($("#service-cost").value),
    estimate: Number($("#service-estimate").value || 0),
    mechanic: $("#service-mechanic").value.trim(),
    status: $("#service-status").value,
    payment: $("#service-payment").value,
    parts: $("#service-parts").value.trim(),
    nextKm: Number($("#service-next-km").value || 0),
    nextMonths: Number($("#service-next-months").value || 0),
    duration: Number($("#service-duration").value || 2),
    estimateApproved: $("#service-estimate-approved").checked,
    nextDate: $("#service-next-date").value,
    note: $("#service-note").value.trim()
  };

  if (!service.carId) {
    showToast("Avval avtomobil qo‘shing");
    return;
  }

  const previousServices = state.services
    .filter((item) => item.carId === service.carId && item.id !== id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (previousServices.length && service.mileage < Number(previousServices[0].mileage || 0)) {
    showToast(`Probeg avvalgi ${previousServices[0].mileage} km dan kam bo‘lmasligi kerak`);
    return;
  }

  const oilService = /moy|oil|yog/i.test(service.type);
  if (oilService && (service.nextKm > 0 || service.nextMonths > 0)) {
    if (service.nextKm > 0) {
      service.nextMileage = service.mileage + service.nextKm;
    }
    if (service.nextMonths > 0) {
      const date = new Date(`${service.date}T00:00:00`);
      date.setMonth(date.getMonth() + service.nextMonths);
      service.nextDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
  }

  if (["Jarayonda", "Bajarildi"].includes(service.status) && !service.estimateApproved) {
    showToast("Ishni boshlash uchun haydovchi smetani tasdiqlashi shart");
    return;
  }

  if (service.mechanic) {
    const start = new Date(`${service.date}T${service.time}:00`).getTime();
    const end = start + service.duration * 60 * 60 * 1000;
    const conflict = state.services.find((item) => {
      if (item.id === id || item.mechanic !== service.mechanic || item.status === "Bekor qilingan") return false;
      const itemStart = new Date(`${item.date}T${item.time || "09:00"}:00`).getTime();
      const itemEnd = itemStart + Number(item.duration || 2) * 60 * 60 * 1000;
      return start < itemEnd && end > itemStart;
    });
    if (conflict) {
      showToast("Bu mexanik tanlangan vaqtda boshqa avtomobilga biriktirilgan");
      return;
    }
  }

  if (id) {
    state.services = state.services.map((item) => item.id === id ? service : item);
  } else {
    state.services.push(service);
  }

  saveData();
  closeModal("service-modal");
  refreshAll();
  showToast(id ? "Servis yozuvi yangilandi" : "Yangi servis yozuvi qo‘shildi");
});

$("#car-search").addEventListener("input", (event) => renderCars(event.target.value));
$("#service-search").addEventListener("input", (event) => renderServices(event.target.value));
$("#enable-notifications-btn").addEventListener("click", enableNotifications);

document.addEventListener("click", (event) => {
  const exportCar = event.target.closest("[data-export-car]");
  const editCar = event.target.closest("[data-edit-car]");
  const deleteCar = event.target.closest("[data-delete-car]");
  const editService = event.target.closest("[data-edit-service]");
  const deleteService = event.target.closest("[data-delete-service]");

  if (exportCar) {
    exportServiceHistory(exportCar.dataset.exportCar);
  }

  if (editCar) {
    const car = getCar(editCar.dataset.editCar);
    if (!car) return;
    $("#car-id").value = car.id;
    $("#car-model").value = car.model;
    $("#car-plate").value = car.plate;
    $("#car-owner").value = car.owner;
    $("#car-phone").value = car.phone;
    $("#car-year").value = car.year;
    $("#car-vin").value = car.vin || "";
    $("#car-modal-title").textContent = "Avtomobilni tahrirlash";
    openModal("car-modal");
  }

  if (deleteCar) {
    if (!confirm("Bu avtomobilni o‘chirishga ishonchingiz komilmi?")) return;
    state.cars = state.cars.filter((car) => car.id !== deleteCar.dataset.deleteCar);
    state.services = state.services.filter((service) => service.carId !== deleteCar.dataset.deleteCar);
    saveData();
    refreshAll();
    showToast("Avtomobil o‘chirildi");
  }

  if (editService) {
    const service = state.services.find((item) => item.id === editService.dataset.editService);
    if (!service) return;
    $("#service-id").value = service.id;
    $("#service-date").value = service.date;
    $("#service-time").value = service.time || "09:00";
    $("#service-type").value = service.type;
    $("#service-mileage").value = service.mileage;
    $("#service-cost").value = service.cost;
    $("#service-estimate").value = service.estimate || service.cost || 0;
    $("#service-mechanic").value = service.mechanic || "";
    $("#service-status").value = service.status || "Yozilgan";
    $("#service-payment").value = service.payment || "To‘lanmagan";
    $("#service-parts").value = service.parts || "";
    $("#service-next-km").value = service.nextKm || "";
    $("#service-next-months").value = service.nextMonths || "";
    $("#service-duration").value = service.duration || 2;
    $("#service-estimate-approved").checked = Boolean(service.estimateApproved);
    $("#service-next-date").value = service.nextDate;
    $("#service-note").value = service.note || "";
    renderCarOptions(service.carId);
    $("#service-modal-title").textContent = "Servis yozuvini tahrirlash";
    openModal("service-modal");
  }

  if (deleteService) {
    if (!confirm("Bu xizmat yozuvini o‘chirishga ishonchingiz komilmi?")) return;
    state.services = state.services.filter((service) => service.id !== deleteService.dataset.deleteService);
    saveData();
    refreshAll();
    showToast("Servis yozuvi o‘chirildi");
  }
});

$$(".filter-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    state.activeFilter = chip.dataset.filter;
    $$(".filter-chip").forEach((item) => item.classList.toggle("active", item === chip));
    renderReminders();
  });
});

function applyRole(role) {
  state.role = role;
  localStorage.setItem("avtoservis_role", role);
  $("#role-select").value = role;

  const allFields = [
    "service-car", "service-date", "service-time", "service-type",
    "service-mileage", "service-cost", "service-estimate", "service-mechanic",
    "service-status", "service-payment", "service-next-date",
    "service-parts", "service-note", "service-next-km", "service-next-months",
    "service-duration", "service-estimate-approved"
  ];
  const enabledFields = {
    haydovchi: ["service-car", "service-date", "service-time", "service-type", "service-estimate-approved"],
    maslahatchi: [
      "service-car", "service-date", "service-time", "service-type",
      "service-cost", "service-estimate", "service-mechanic",
      "service-status", "service-payment", "service-estimate-approved"
    ],
    mexanik: [
      "service-car", "service-type", "service-mileage", "service-status",
      "service-next-date", "service-parts", "service-note", "service-next-km",
      "service-next-months", "service-duration"
    ]
  }[role];

  allFields.forEach((id) => {
    $(id).disabled = !enabledFields.includes(id);
  });

  $("#add-car-btn").disabled = role !== "haydovchi";

  const roleNames = {
    haydovchi: "Haydovchi",
    maslahatchi: "Servis maslahatchisi",
    mexanik: "Mexanik"
  };
  showToast(`Rol: ${roleNames[role]}`);
}

$("#role-select").addEventListener("change", (event) => applyRole(event.target.value));

seedDemoData();
loadData();
refreshAll();
applyRole(state.role);
if ("Notification" in window && Notification.permission === "granted") {
  sendServiceNotifications();
}
