document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("fileInput");

  // Upload progress elements
  const uploadProgress = document.getElementById("uploadProgress");
  const uploadProgressBar = document.getElementById("uploadProgressBar");
  const uploadPercentage = document.getElementById("uploadPercentage");
  const uploadStatus = document.getElementById("uploadStatus");

  // Import progress elements
  const importProgress = document.getElementById("importProgress");
  const importProgressBar = document.getElementById("importProgressBar");
  const importPercentage = document.getElementById("importPercentage");
  const importStatus = document.getElementById("importStatus");

  // Fetch employee
  const employeesList = document.getElementById("employeesList");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleFile(file);
  });

  // Input File
  function handleFile(file) {
    if (!file) return;
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      alert("Mohon upload file CSV");
      return;
    }
    uploadFile(file);
  }

  // Upload File
  async function uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file);

    uploadProgress.style.display = "block";
    importProgress.style.display = "block";

    try {
      // Upload file
      const response = await axios.post("/api/upload", formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          uploadProgressBar.style.width = percentCompleted + "%";
          uploadPercentage.textContent = percentCompleted + "%";
          uploadStatus.textContent = `Mengupload file: ${percentCompleted}%`;
        },
      });

      uploadStatus.innerHTML = '<span class="success">Upload selesai!</span>';

      // Start polling import status
      pollImportStatus(response.data.jobId);
    } catch (error) {
      uploadStatus.innerHTML = `<span class="error">Error: ${error.message}</span>`;
    }
  }

  // Import Status
  async function pollImportStatus(jobId) {
    const pollInterval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/status/${jobId}`);
        const { progress, status: importState } = response.data;

        importProgressBar.style.width = progress + "%";
        importPercentage.textContent = progress + "%";
        importStatus.textContent = `Status: ${importState}`;

        if (progress === 100 || importState === "completed") {
          clearInterval(pollInterval);
          importStatus.innerHTML =
            '<span class="success">Import selesai!</span>';

          console.log("Starting initial fetch of employees..."); // Added logging
          fetchEmployees(currentPage);
        } else if (importState === "error") {
          clearInterval(pollInterval);
          importStatus.innerHTML =
            '<span class="error">Terjadi kesalahan saat import</span>';
        }
      } catch (error) {
        clearInterval(pollInterval);
        importStatus.innerHTML = `<span class="error">Error: ${error.message}</span>`;
      }
    }, 1000);
  }

  // Fetch Data Karyawan
  let currentPage = 1;
  let totalPages = 1;

  async function fetchEmployees(page) {
    console.log("Fetching employees for page:", page);
    try {
      const url = `/api/employees?page=${page}&limit=10`;
      const response = await axios.get(url);

      if (response.data && response.data.status === "success") {
        const { data, pagination } = response.data;
        totalPages = pagination.totalPages;
        pageInfo.textContent = `Page ${page} of ${totalPages}`;

        if (Array.isArray(data) && data.length > 0) {
          employeesList.innerHTML = `<pre>${JSON.stringify(
            data,
            null,
            2
          )}</pre>`;
        } else {
          employeesList.innerHTML = JSON.stringify({
            message: "Tidak ada data karyawan",
          });
        }
      } else {
        console.error("Invalid response format:", response);
        employeesList.innerHTML = JSON.stringify({
          error: "Format data tidak valid",
        });
      }
    } catch (error) {
      console.error("Error details:", error);
      let errorMessage = "Error loading data";

      if (error.response) {
        errorMessage = `Error: ${error.response.status} - ${
          error.response.data.message || "Unknown error"
        }`;
      } else if (error.request) {
        errorMessage = "Tidak dapat terhubung ke server";
      } else {
        errorMessage = error.message;
      }

      employeesList.innerHTML = JSON.stringify({ error: errorMessage });
    }
  }

  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      fetchEmployees(currentPage);
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchEmployees(currentPage);
    }
  });
});
