(() => {
    if (localStorage.getItem('useDefaultBackground') === 'true') return;

    const startupWallpaper = localStorage.getItem('originalWallpaper');
    if (!startupWallpaper || startupWallpaper.startsWith('idb:') || startupWallpaper.startsWith('data:')) return;

    const wallpaperImage = `url(${JSON.stringify(startupWallpaper)})`;
    document.body.classList.add('has-wallpaper');
    document.body.style.setProperty('--wallpaper-image', wallpaperImage);
    Object.assign(document.body.style, {
        backgroundImage: wallpaperImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
    });
})();
